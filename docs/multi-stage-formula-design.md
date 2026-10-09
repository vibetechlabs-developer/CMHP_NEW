# Multi-Stage Formula Design — Assessment and Proposal

Status: **design proposal only**. Nothing in this document has been implemented. It is the output of a read-only inspection of the current codebase plus a proposed (additive, backward-compatible) data model, calculation strategy, approval/history treatment, BMR treatment, frontend treatment, and compatibility plan for formulas that internally prepare more than one mixture before a final combination step.

Companion docs this should be read alongside: `docs/backend-decisions.md`, `docs/erp-handoff-open-decisions.md`, `docs/client-register-field-mapping.md` (referenced below where directly relevant; not duplicated here).

Section lettering below follows the brief's own deliverable list exactly (A–J); content the brief asked about under separate numbered headings (scaling/process instructions, approval/historical safety, BMR design) is folded into whichever lettered section it most concretely belongs to, and called out by name so nothing is lost.

---

## A. Confirmed client requirement

A finished product can require **multiple preparations within the same manufacturing batch**. Worked (synthetic) example used throughout this document:

1. Mix raw materials A, B and C, then boil them → prepares **ABC** (an intermediate mixture).
2. Mix raw materials P, Q and R → prepares **PQR** (a second intermediate mixture).
3. Add PQR to ABC → final product **MNC**.

Confirmed constraints on the solution:

- ABC and PQR are **not** separately stocked semi-finished products. No new `Product`/`Material` master, no inventory receipt, no independent stock balance is created for them. They exist only as structure inside one formula revision.
- One formula can have multiple stages; existing single-stage formulas must keep working exactly as today (no new one-formula-per-product constraint, no forced migration of existing formulas).
- The two operating companies, the shared physical store, the ~4,000 product catalog, and material/packaging distinctions are existing context, unchanged by this proposal.
- Legal stock ownership, lot/expiry, QC release, losses, yield, and operational rounding remain **unresolved** and are **not** answered by this document — they are called out explicitly in Section H and nothing below invents a placeholder for them.

---

## B. Current code capabilities and gaps (verified)

Every claim below was verified by reading the named file. Anything not found is stated as not found, not assumed absent.

### B.1 Formula domain (`apps/formulas`)

- `Formula` (`apps/formulas/models.py:10-96`) — company-scoped identity for one `Product`. `company`/`product`/`code` immutable after creation (`clean()`, lines 64-85). `delete()` (lines 91-96) blocks deletion once any revision leaves `DRAFT`.
- `FormulaRevision` (`models.py:99-251`) — one draft/submitted/approved revision. `Status` is `DRAFT → SUBMITTED → APPROVED` (lines 136-146; `SUBMITTED` added for the recently-built QA workflow, `apps/formulas/approval.py`). An `APPROVED` revision is immutable (`clean()` lines 230-233 blocks any content change once approved). `output_uom` is immutable once set (lines 239-240) and may legitimately differ from the product's own sales unit (Task 12B-2 note, lines 125-133) — batch planning is where any packing-unit conversion happens, never here.
- `FormulaLine` (`models.py:314-439`) — **flat list**, one `line_number` sequence across both `RAW_MATERIAL` and `PACKAGING_MATERIAL` lines (no grouping concept at all today). Each line has `calculation_mode` (`AS_PER_FORMULA` default, or `AS_PER_LABEL_CLAIM`, lines 324-327), with `label_claim_quantity`/`label_claim_uom` required together only in the label-claim mode and validated against the revision's own `output_uom` (dimension match + both units needing `canonical_factor`, lines 385-414). `clean()`/`delete()` both block any change once the parent revision leaves `DRAFT` (lines 380-383, 433-438). **There is no field or model expressing that one line "produces" an intermediate, or that a line belongs to a sub-group/stage of the revision.**
- `FormulaRevisionContributor` (`models.py:254-278`) — one row per user who created the revision or made a *substantive* content change (base output, revision notes, or lines). Read by the self-approval rule in `apps/formulas/approval.py`.
- `FormulaApprovalPolicy` (`models.py:281-311`) — per-company, explicit `allow_self_approval` (`null` = unanswered, fails closed).
- `apps/formulas/approval.py` — `assess_approval()` (lines 125-248) is the one pure assessment function shared by the approval-preview and the real approve command; current gate is `status == SUBMITTED` (lines 134-147, i.e. approval is no longer reachable directly from `DRAFT` — a QA submit/approve/reject workflow was added this cycle: `submit_formula_revision` lines 363-438, `reject_formula_revision` lines 442-514 — SUBMITTED → DRAFT, same revision, editable again — and `approve_formula_revision` lines 517-605, SUBMITTED → APPROVED). `lock_and_load_approval_context()` (lines 321-359) documents and enforces a fixed lock order: revision → formula → policy → product → units → materials.
- `apps/formulas/requirement_preview.py` — `build_requirement_preview(revision, lines, target)` (lines 190-393) is the **one** calculation engine. Exact-`Fraction` arithmetic throughout (module docstring lines 10-24: `fractions.Fraction`, never binary float; `_terminates`/`_display` lines 121-139 decide exactness and render at `DISPLAY_SIGNIFICANT_DIGITS=50` with `ROUND_HALF_EVEN`). Per line: `AS_PER_FORMULA` → `required = line.quantity * target/base_output_quantity` (lines 256-262); `AS_PER_LABEL_CLAIM` → `required = target / (label_claim_quantity converted into the output unit via canonical_factor)` (lines 227-255). **It iterates the revision's flat line list only — no concept of stages, grouping, or any "internal consumption" distinct from "external material demand."**
- `apps/formula_imports` (CSV import, Task 14B) — `parse_formula_csv`/`create_import_preview`/`commit_import` (`services.py`). Columns: `formula_code, formula_name, product_code, base_output_quantity, output_uom_code, material_code, material_quantity, formula_notes, revision_notes` (`SUPPORTED_COLUMNS`, lines 49-52). Groups rows by `formula_code` (lines 267-287) and creates one brand-new `Formula` + `DRAFT` revision 1 + flat lines + one contributor row, all-or-nothing (lines 436-781). **No stage-related column exists; every imported formula is single-stage by construction.**

### B.2 Downstream pipeline — verified to be three independent branches, not a chain

```
FormulaRevision (APPROVED) ──FK (PROTECT)── BatchPlan
                                               │ status: DRAFT only — no further
                                               │ transition exists anywhere in the code
                                               │ (apps/batch_plans/models.py:46-47;
                                               │ services.py has only create_batch_plan
                                               │ and update_batch_plan)
                              ┌────────────────┼────────────────┐
                              │                 │                │
                     BatchNumberAllocation  MaterialRequisition  BatchManufacturingRecord
                     (one-way, optional,    (OneToOne to          (BMR; OneToOne to
                      never changes          BatchPlan; own       BatchPlan AND its own
                      BatchPlan.status)      DRAFT→SUBMITTED→     FK to FormulaRevision;
                                              APPROVED/REJECTED   NO status field at all;
                                              lifecycle; lines    created via a separate,
                                              copied 1:1 from     user-triggered POST;
                                              FormulaLine, no     requires the batch
                                              aggregation)        plan's requirement
                                                                  preview to be
                                                                  calculation_complete)
```

Verified specifics:

- `BatchPlan` (`apps/batch_plans/models.py:11-202`) has no line model of its own — it reads the linked `FormulaRevision`'s own `FormulaLine` rows directly (`requirement_preview.load_consistent_batch_plan`, line 46: `lines = _load_lines(plan.formula_revision)`). Its own status is **permanently `DRAFT`** — there is no approve/submit transition for a BatchPlan anywhere in the code.
- `apps/batch_plans/requirement_preview.py` imports `apps.formulas.requirement_preview` directly (`build_requirement_preview`) and calls it unchanged against `plan.target_output_quantity` — **same calculator, not a second one**. `apps/batch_plans/validation.py::compute_expected_packed_content` (lines 158-174) is a *separate* packing-assessment helper (planned-pack-count × content-per-pack, converted into the output unit via `canonical_factor`) used only to compare against the plan's own target quantity — it has nothing to do with formula lines or stages.
- `apps/material_requisitions` creates **exactly one `MaterialRequisitionLine` per `FormulaLine`** (`services.py`, loop building lines 1:1 from the formula's lines) — **no aggregation across lines or materials today**, and a separate `MaterialRequisitionRound`/`MaterialRequisitionRoundLine` pair (`models.py:405-539`) freezes an immutable snapshot each time a requisition is submitted for its own DRAFT→SUBMITTED→APPROVED/REJECTED lifecycle (parallel to, and independent of, the formula's own DRAFT→SUBMITTED→APPROVED lifecycle — these are two separate state machines on two separate models).
- `apps/bmr` (`BatchManufacturingRecord`/`BMRLine`, `models.py:9-71`) has **no status field at all**. It is generated once, non-regenerable (`create_bmr` raises `Conflict` if one already exists), via an explicit user-triggered `POST`, by snapshotting the **current output** of the batch plan's requirement preview into `BMRLine.required_text` (a frozen *string*, never recomputed) split into two "slips" (`Slip.RAW` / `Slip.PACKING`) by `material_type`. After generation, only four free-text fields per line are editable (`special_value, label_claim, ar_no, qty_received[PACKING only]`) — `required_text` itself is permanently locked. **`BMRLine.formula_line_id` is a bare integer, not an FK** — it records which formula line a BMR row came from but carries no referential integrity.
- **No code path requires `MaterialRequisition.status == APPROVED` before a BMR can be created, or vice versa** — confirmed by grep of both apps' imports; neither references the other at all. This ordering (if any is intended) is undecided in the current implementation and is listed as an open question in Section H.
- `apps/store_preparation` is a same-named-sounding but **unrelated** app: it tracks store-side `packing_type` free text and an `insert_required` tri-state per `BatchPlan` or `SalesOrderLine` — packing/logistics metadata, not manufacturing steps. Confirmed to have no relationship to BMR or material requisitions.
- No "stage", "step", "phase", "intermediate", "sub-batch", or "multi-stage" concept exists anywhere in `apps/formulas`, `apps/batch_plans`, `apps/material_requisitions`, or `apps/bmr` today — confirmed by targeted grep across all four apps. Every substring hit is either "wastage"/"packaging" or a reference to the unrelated `store_preparation` app. **This is genuinely new ground, not a partially-built feature.**

### B.3 Frontend (verified)

- `frontend/src/features/formulas/FormulasPage.jsx` is the single file containing the whole formula editor (`FormulaCreateForm`, `NewRevisionDialog`, `RevisionView`, `MaterialTable`, `ApprovalPanel`). `RevisionView` renders, inside one `.fm-card`: summary → Raw-material `MaterialTable` → Packaging-material `MaterialTable` → save bar → `RequirementCalculator` → `ApprovalPanel`. Both tables are the *same component*, each independently filtering one flat `revision.lines` array by `material_type` — there is no grouping/stage concept anywhere in this file today, confirmed.
- `MaterialTable`'s "Requisite" column (the `calculation_mode` dropdown added for the label-claim feature) is the most recent precedent for an editable per-line enum control, and its pattern (dropdown + conditionally-rendered extra columns + client-side payload shaping in `formulasService.js::buildRevisionLinesPayload`) is the template a stage-assignment control should follow.
- `frontend/src/features/formulas/RequirementCalculator.jsx` renders two separate flat tables (raw/packaging) from one `result.lines` array returned by the backend preview — same "filter one flat array by a line attribute" pattern used three times already (`MaterialTable`, `RequirementCalculator`, and `BmrPanel`'s `SlipTable`). This is the natural extension point for a *third* filter dimension (stage) without inventing new UI machinery.
- `frontend/src/features/formulas/FormulasPage.css` defines the full design-token set (`--fm-*` colors/radii/sizes) and two existing "grouping" visual primitives: `.pw-tabs`/`.pw-tab` (underline tab bar, used today in `ProductsPanel.jsx`) and `.fm-steps` (non-interactive numbered-pill progress stepper, used today for the formula-editing workflow). Neither is stage-specific; both are directly reusable.
- The batch plan screen is not a standalone page — it is the "Batch and printing" section inside `SalesOrderFormModal.jsx`, and `BmrPanel.jsx` is rendered directly below it in the same form, keyed by the saved plan id. Both are strictly read-mostly views over backend-computed data; neither does client-side arithmetic.
- There is no formula CSV import UI on the frontend at all (`formula_imports` is backend/API-only today).

### B.4 Summary of what's reusable vs. what's missing

**Reusable as-is:** the exact-`Fraction` requirement calculator; the approval/contributor/immutability machinery (all keyed off "is this revision still DRAFT"); the lock-order discipline and "explicit, never inferred" serializer convention; frontend grouping primitives (`.pw-tabs`, `.fm-steps`) and the "flat array filtered by an attribute into N typed tables" pattern used three times already.

**Genuinely missing (would be new):** any notion of a stage/preparation-step, its ordering, its dependency on other stages, or a line's membership in one; any aggregation of requirement rows across a grouping dimension; any frontend concept of per-stage material tables, instructions, or a final-output summary; any CSV import support for stage structure.

---

## C. Proposed data relationships and dependency rules

**Design goal: additive only.** A revision with zero stages behaves in every respect exactly as today (this is the backward-compatibility anchor for Section F). Stages are opt-in structure layered onto the *existing* flat line list — they are never a replacement for it.

### C.1 New model: `FormulaStage`

```python
class FormulaStage(models.Model):
    revision = models.ForeignKey(FormulaRevision, on_delete=models.CASCADE, related_name="stages")
    stage_number = models.PositiveIntegerField()   # DISPLAY SEQUENCE ONLY — see C.3
    code = models.CharField(max_length=32, blank=True)     # optional short label, e.g. "ABC"
    name = models.CharField(max_length=255)                # e.g. "Prepare ABC"
    instructions = models.TextField(blank=True)             # free text, NEVER auto-scaled (see C.6)
    is_final = models.BooleanField(default=False)
    depends_on = models.ManyToManyField("self", symmetrical=False, related_name="feeds_into", blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["revision", "stage_number"], name="unique_stage_number_per_revision"),
            UniqueConstraint(
                fields=["revision"], condition=Q(is_final=True), name="exactly_one_final_stage_per_revision",
            ),
        ]
```

- `stage_number` is the **display sequence** the client sees (1, 2, 3, …) — it carries no execution-order meaning by itself (see C.3).
- `is_final` marks the one stage whose implicit output *is* the revision's existing `base_output_quantity`/`output_uom` — exactly today's single number, now attached to a specific stage instead of the revision as a whole. The partial unique constraint (`condition=Q(is_final=True)`) enforces exactly one per revision at the database level; a revision with zero `FormulaStage` rows has no `is_final` row either and is simply flat (today's behavior, unchanged).
- `depends_on` is a self-referential M2M, validated (service-layer, under the revision's existing DRAFT-only write lock) to reject:
  - a dependency on a stage belonging to a **different** `revision_id` (structurally impossible by FK scoping once the service only offers same-revision choices, but validated explicitly rather than trusted),
  - a **cycle** anywhere in the dependency graph (a plain DFS/topological-sort check over the revision's own stages — bounded and cheap, since a revision realistically has at most a handful of stages),
  - a dependency pointing at the stage itself.

### C.2 `FormulaLine` gets one new nullable field

```python
stage = models.ForeignKey(FormulaStage, on_delete=models.CASCADE, null=True, blank=True, related_name="lines")
```

- `null` (today's exact behavior) means "the revision's one implicit stage" — i.e. a flat, single-stage formula never needs a `FormulaStage` row at all. This is the backward-compatibility hinge: existing formulas, and any newly-created single-stage formula, simply never populate `stage`.
- The moment a revision has **any** `FormulaStage` row, the service layer requires every line to carry a non-null `stage_id` belonging to that same revision (explicit, never inferred — matching the existing `calculation_mode`/`label_claim_*` convention in `FormulaLine.clean()`). A revision is never allowed to mix "some lines staged, some not."
- `on_delete=CASCADE` matches `revision`'s own cascade (a stage is revision content, same as a line) — deleting a stage while DRAFT requires first reassigning or removing its lines (service-level check, mirroring how `update_formula_revision` already treats a complete line replacement as one atomic PATCH).

### C.3 Display sequence vs. execution dependency — explicitly separated

`stage_number` (display) and `depends_on` (execution) are deliberately two different fields, because the client's own example needs it: Stage 3 (final, MNC) depends on **both** Stage 1 (ABC) and Stage 2 (PQR), but nothing requires Stage 1 and Stage 2 to run in parallel or in a fixed order relative to each other — the dependency graph is the only thing that matters for correctness; `stage_number` is purely how the UI orders the cards/tabs. A topological sort of `depends_on` is used only to validate the graph is acyclic (C.1) and, optionally, to suggest a default display order — it is never used to *infer* a sequence the user didn't choose.

### C.4 Whole-preparation transfer only (v1 scope decision)

A stage that depends on another is defined, for this design, to consume the **entire** prepared output of each stage it depends on — there is no quantity, percentage, or partial-transfer concept on the dependency edge itself, and no numeric "output quantity" field exists on a non-final `FormulaStage` at all. This is a deliberate, minimal choice:

- It sidesteps yield/evaporation/loss entirely (unresolved per the client — Section H) because no non-final stage ever claims to produce a specific quantity of anything.
- It keeps the existing calculator untouched (Section E): only `FormulaLine.quantity` values (raw/packaging materials, each attached to some stage) and the revision's existing single `base_output_quantity` (now attached to the one `is_final` stage) ever participate in the `target/base` scaling arithmetic.
- **Open question, explicitly not answered here:** whether a later revision of this feature needs partial transfers, split outputs, or an explicit intermediate-quantity/yield field. Flagged again in Section H.

### C.5 Why ABC/PQR are never double-counted or separately stocked (structural, not policy)

ABC and PQR never appear as a `Material`, a `FormulaLine.material_id`, or any kind of stock-affecting row anywhere in this design. They exist purely as the `name`/`code` of a `FormulaStage` and the *target* of other stages' `depends_on` edges. The only rows that ever represent physical material demand are `FormulaLine` rows (unchanged — still always a real `Material` with a real base unit), each now optionally tagged with the stage it belongs to. See Section E for why this guarantees no double counting without any new logic in the calculator.

### C.6 Scaling and process instructions (folds in the brief's section 4)

- **Proportional scaling is preserved exactly as today** for every `FormulaLine`, regardless of which stage it belongs to — a line's `calculation_mode` (`AS_PER_FORMULA`/`AS_PER_LABEL_CLAIM`) and its existing quantity/label-claim fields are completely unaffected by stage membership. Whether some lines should ever be fixed-per-batch rather than proportional is an already-acknowledged, pre-existing gap (`requirement_preview.py` module docstring) independent of this proposal.
- **Never auto-scaled, ever**: `FormulaStage.instructions` is free text, never touched by the scaling calculation — matching the client's explicit instruction that temperature, duration, mixing speed, and process instructions must never be derived or scaled. This is enforced simply by never giving `instructions` a numeric type or a formula — it is a `TextField`, full stop.
- **Final output is never derived by summing raw-material weights.** The `is_final` stage's output is still exactly `revision.base_output_quantity` in `revision.output_uom` — a number the user states, scaled by the existing target/base ratio — never a sum of A+B+C+P+Q+R's weights. Boiling/evaporation/yield differences between "what went in" and "what came out" are explicitly **not modeled** anywhere in this design (no `expected_yield`, no `loss_factor` field exists on `FormulaStage`), consistent with the client's own statement that these are unresolved. If the client later confirms a yield policy, it would be an *additional* field on `FormulaStage` (non-final stages could then optionally state an expected intermediate output), not a change to this document's core structure.
- **Three distinct quantities, kept distinct** (the client's own requested separation):
  - *Formula base output* — `FormulaRevision.base_output_quantity`/`output_uom`, attached to the `is_final` stage, unchanged field.
  - *Calculated input requirement* — the existing per-line `required_quantity` from `build_requirement_preview`, now additionally stage-tagged; still a planning estimate only (existing disclaimers apply unchanged).
  - *Actual stage output* — **does not exist today and is out of scope for this slice** (see Section H; it would belong to a later production-execution task, not formula/BMR planning).

### C.7 Approval and historical safety (folds in the brief's section 5)

No new mechanism is needed — `FormulaStage` and its `depends_on` edges are revision content, subject to exactly the same existing invariants `FormulaLine` already has:

- **Mutability**: `FormulaStage.clean()`/`delete()` would check `self.revision.status != FormulaRevision.Status.DRAFT` and raise, the identical pattern already in `FormulaLine.clean()`/`.delete()`. Once a revision is `APPROVED`, its stages (like its lines) become permanently frozen — no new code path is needed beyond replicating this existing check.
- **Contributor tracking**: creating/editing/removing a stage, or reassigning a line's `stage_id`, is a *substantive content change* by the existing definition — `apps.formulas.services`'s existing contributor-registration call sites simply need to also fire on stage mutations, using the exact same `FormulaRevisionContributor` model and self-approval policy already in place. No new permission or policy model is needed.
- **Approval policy/permission checks**: entirely unchanged — `assess_approval`, `FormulaApprovalPolicy`, `formulas.approve`/`formulas.submit` all operate at the revision level and need no awareness of stages at all, since eligibility is still "is every line/stage of this DRAFT-turned-SUBMITTED revision structurally valid," which Section E shows requires no new arithmetic.
- **Batch/BMR references to the exact revision**: unchanged — `BatchPlan.formula_revision` and `BMR.formula_revision` already pin a specific, immutable, approved `FormulaRevision` by FK; stages simply ride along as part of that same frozen revision, inheriting its immutability for free.
- **Historical readability**: unchanged mechanism — `approved_identity_snapshot` (already a free-form JSON field) can optionally be extended to include a stage-structure summary at approval time, exactly as it already freezes formula/product/unit identity today; this is additive and never breaks reading an *older* approved revision that predates stages (it simply has no `stages` key in its snapshot, and zero `FormulaStage` rows — handled identically to "flat formula" everywhere else in this document).
- **Approval does not mean production has happened** — restated explicitly because stages make it tempting to imply otherwise: approving a multi-stage revision records that its *structure* (stages, dependencies, lines) was approved, exactly as approving a flat revision today records only that its lines were approved. It still does not create batches, reserve stock, issue material, or authorize production (existing, unchanged scope boundary).

---

## D. Synthetic MNC example, from formula to requisition to BMR

Using the client's own ABC/PQR/MNC example, scaled to a target output of, say, 10 kg of MNC (output unit: `KG`):

| Stage | `stage_number` | `is_final` | `depends_on` | Lines (material, base qty) |
|---|---|---|---|---|
| Prepare ABC | 1 | No | — | A (2 kg), B (1 kg), C (0.5 kg) |
| Prepare PQR | 2 | No | — | P (1 kg), Q (1 kg), R (0.5 kg) |
| Combine → MNC | 3 | **Yes** | Stage 1, Stage 2 | *(packaging lines, if any, attach here)* |

- `FormulaRevision.base_output_quantity` = whatever base quantity Stage 3 (the `is_final` stage) was drafted against (today's exact field — e.g. "5 kg base"), `output_uom` = `KG`.
- Requirement preview at target 10 kg: `scale_factor = 10/5 = 2`. Every raw-material line scales by that same factor regardless of which stage it's tagged with — A→4 kg, B→2 kg, C→1 kg, P→2 kg, Q→2 kg, R→1 kg (Section E shows why this needs zero new arithmetic).
- **External material demand = A + B + C + P + Q + R** (scaled), plus any packaging lines on the final stage. ABC and PQR themselves are never requisitioned, never requisitioned-for, and never appear as a line anywhere — they are satisfied entirely by their own stage's input lines.

**→ Requisition**: a `MaterialRequisition` built from this revision still creates exactly one `MaterialRequisitionLine` per `FormulaLine` (today's 1:1 rule, Section B.2) — six lines (A, B, C, P, Q, R) plus packaging, each now additionally carrying which stage it came from (`stage_id`/`stage_code`, passthrough only — see Section E). No change to its DRAFT→SUBMITTED→APPROVED/REJECTED lifecycle or its round-snapshot mechanism.

**→ BMR**: a BMR built from this batch plan gets three stage-grouped sections ("Prepare ABC" / "Prepare PQR" / "Combine → MNC") instead of today's two kind-grouped slips (RAW/PACKING), each showing that stage's frozen `instructions` text and its own lines' frozen requirements, plus which other stage(s) it consumes (display only — "consumes: Stage 1 (ABC), Stage 2 (PQR)"). Generation stays a one-time, explicit, non-regenerable snapshot exactly as today; the only new field is a passthrough `stage_id`/frozen `stage_name` string on `BMRLine` (same non-FK snapshot convention `material_code`/`material_name` already use). **No execution gate is introduced**: nothing stops the packing slip or any stage's lines from being viewed/edited in any order, because today's BMR has no status/workflow field at all for *any* stage, raw, or packaging line — this design deliberately keeps that identical, scope-boundary-preserving property (see Section H for why, and what a later execution-gate feature would need instead).

---

## E. Double-counting prevention

**No change to the calculation engine is needed.** `apps/formulas/requirement_preview.py::build_requirement_preview` already iterates `revision.lines` (now with an added `stage_id` attribute, ignored by the arithmetic) and computes `required = line.quantity * target/base` (or the label-claim variant) per line, exactly as today. Because:

1. ABC/PQR are never lines (Section C.5), they can never be counted, let alone double-counted.
2. Every real raw/packaging material still appears as **exactly one** `FormulaLine` row, tagged with **exactly one** stage (or none, for flat formulas) — the existing `UniqueConstraint(fields=["revision", "line_number"])` and the flat per-revision line list are untouched.
3. The *only* new behavior needed is **presentation**: the preview's `lines` response gains `stage_id`/`stage_code`/`stage_name` passthrough fields (trivial, additive — no change to `assess_approval` or the arithmetic), and two new read-only aggregation views are added alongside the existing per-line rows:
   - **Stage-wise requirement** — today's existing flat list, grouped client-side (or, if preferred, server-side) by `stage_id`, purely for display; no new numbers.
   - **Aggregated store requirement** — the same flat list grouped by `(material_id, unit_id)` and *summed as exact `Fraction`s before any display rounding* (reusing `_to_fraction`/`_display` from the same module, never re-deriving the ratio from already-rounded display strings — the same "exact arithmetic, display precision only at the edge" discipline the module already documents). Traceability back to source stages is free: each aggregated row simply lists the `line_id`s (and their `stage_id`s) it summed.
4. **Unit safety**: aggregation only ever sums lines that already share the *same* `unit_id` (never cross-unit merging) — if the same material appears on two stages in different units, the aggregated view shows two separate rows, each individually traceable, rather than silently converting. This matches the project's existing "never guess a conversion" convention (`apps/batch_plans/validation.py` module docstring).
5. `apps/material_requisitions` and `apps/bmr` can **either** keep their current 1:1-per-line behavior (simplest, no double counting by construction, matches today exactly) **or** optionally offer the aggregated view as an additional display layer — this document recommends keeping the underlying stored rows 1:1-per-line (traceability, matches every existing immutability/snapshot guarantee) and doing aggregation only in a read-only presentation layer, never by collapsing stored rows.

---

## F. Backward compatibility and historical-data strategy

- **Existing flat DRAFT formulas**: read and edited exactly as today — zero `FormulaStage` rows, every line's `stage_id` is `null`, no behavior change anywhere (calculator, approval, services).
- **Existing APPROVED formulas**: identical — an approved revision's absence of stages is simply its permanently-frozen state, exactly as any other pre-feature field default would be. Nothing is backfilled onto an approved record (consistent with the existing, hard rule that approved content is immutable).
- **Existing batch plans, requisitions and BMRs**: all already reference a specific `FormulaRevision` by FK/pinned snapshot — they continue to read that revision's (possibly stage-less) lines exactly as today. No migration of historical rows is needed or proposed.
- **Existing formula CSV import template**: **unchanged, byte-for-byte**, for a file that doesn't mention stages. The proposed extension is **strictly additive**: four new *optional* columns — `stage_code`, `stage_name`, `stage_sequence`, `depends_on_stage_codes` (a simple delimited list, e.g. `"ABC|PQR"`) — added to `SUPPORTED_COLUMNS` only. Rule (matching the project's existing "explicit, never inferred" convention used for every other optional-field group in this codebase): if *no* row in a `formula_code` group has a `stage_code`, the group commits exactly as today (flat, no stages). If *any* row has one, *every* row in that group must have one (non-blank), and `_resolve_groups`/`commit_import` additionally resolve/create the group's `FormulaStage` rows and dependency edges before creating lines — using the same locking discipline (`commit_import`'s documented lock order) already in place, extended by one more step (lock/create stages before lines, since lines now FK to them). **Nothing about the current single-stage CSV format breaks** — a file with none of the four new columns behaves identically to today, by construction (they're simply absent from `column_index`, so every stage-related branch is skipped).

---

## G. Frontend screen changes

Reusing exactly the primitives Section B.3 identified — no new visual language is introduced.

- **Stage tabs** (`RevisionView`, inside the existing `.fm-card`): one `.pw-tab` per `FormulaStage` (the same underline-tab component `ProductsPanel.jsx` already uses), ordered by `stage_number`, each tab body containing that stage's own `MaterialTable` instances (raw/packaging, unchanged component, now additionally filtered by `stage_id`) plus a plain-text `instructions` field and a "depends on: [multi-select of other stages in this revision]" control.
- **A revision with zero stages shows no tabs at all** — it renders exactly today's single raw/packaging `MaterialTable` pair, unchanged. The tab bar itself should only appear once the user explicitly adds a second stage (an explicit "+ Add stage" action, mirroring the existing "+ Add material" button pattern already in `MaterialTable`) — so a simple one-stage formula is *never* shown a tab bar with one tab, keeping the common case exactly as easy as today (the client's own explicit requirement).
- **Final-stage marker**: the `is_final` stage carries today's existing Batch No./output-unit fields (unchanged inputs, just visually scoped to its own tab) plus a small badge (`.fm-badge`, same component used for Draft/Approved today) reading "Final output".
- **Aggregated requirement preview**: `RequirementCalculator.jsx` gains a third, optional grouped view (toggle between "By stage" and "Aggregated" — reusing the existing `RequirementTable` row-rendering, just re-grouped, per Section E) alongside its two existing raw/packaging tables; no new calculation code on the frontend, since every number still comes from the server unchanged.
- **BMR screen**: `BmrPanel.jsx`'s `SlipTable` becomes stage-grouped (per Section D's BMR walkthrough) using the same `onSave`/`TextCell` editing pattern already in place — no new editing machinery.
- **Database terms stay hidden**: the user never sees "FormulaStage," "depends_on," or "is_final" as such — the UI vocabulary is "stage," "this stage uses the output of: ___," and "this is the final stage," matching how `calculation_mode`'s raw enum values are already translated into the plain-language "Requisite: As per formula / As per label claim" labels today.
- **Unrelated screens are not touched** — Sales Order's "Batch and printing" section and the "Manage formulas" launch button are unchanged; they already treat `FormulasPage` as an embeddable black box.

---

## H. Exact remaining client questions

1. **Yield/loss/evaporation**: does a non-final stage ever need to state an expected intermediate output quantity, or is "whole preparation, no numbers" sufficient indefinitely? (Section C.4, C.6)
2. **Partial transfers**: can a stage ever consume only *part* of another stage's output, or split one stage's output across two downstream stages? (Section C.4)
3. **Stage execution gating**: should a BMR ever enforce "stage 2 cannot start until stage 1 is marked complete," and if so, who has authority to mark a stage complete, and does it block anything? (Section D's BMR walkthrough) — currently assumed **no gate at all**, matching BMR's existing complete absence of any status/workflow field. This is explicitly a later production-execution task, not this one.
4. **MaterialRequisition ↔ BMR ordering**: should BMR creation ever require an approved MaterialRequisition first (or vice versa)? Today's code enforces neither order (Section B.2) — this document does not change that, but flags it as a pre-existing ambiguity a staged BMR would inherit unchanged.
5. **Rounding/operational quantities**: unchanged pre-existing open question (not introduced or worsened by stages) — the calculator still reports exact, unrounded requirements with explicit "no rounding rule has been decided" warnings for fractional COUNT-unit results.
6. **Stage-level approval snapshot depth**: should `approved_identity_snapshot` be extended to capture full stage/dependency structure at approval time, or is the existing (already-frozen) revision/line snapshot sufficient since stages ride along as revision content anyway? (Section C.7) — this document proposes the simpler "no change needed" reading but flags the richer snapshot as an easy optional addition if the client wants it visible without re-deriving it from historical `FormulaStage` rows.

---

## I. Dependency-ordered implementation slices

1. **`FormulaStage` model + migration** (additive; no existing table altered) — model, constraints (unique stage number per revision, exactly-one-final-per-revision), `clean()`/`delete()` DRAFT-only gate mirroring `FormulaLine`.
2. **`FormulaLine.stage` nullable FK** + migration (additive column, default `null`, zero behavior change for existing data).
3. **Service-layer stage CRUD** inside `apps.formulas.services.update_formula_revision`'s existing atomic PATCH path (create/rename/reorder/delete stages, assign `depends_on`, assign lines to stages) — cycle rejection, same-revision-only validation, "all-lines-staged-or-none" invariant, contributor registration on substantive stage changes (Section C.7).
4. **Serializer/API surface**: extend `FormulaRevisionSerializer`/`FormulaLineSerializer` with stage fields (additive keys only, existing allow-list convention), add stage CRUD to the existing revision PATCH allow-list.
5. **Calculator passthrough** (Section E): add `stage_id`/`stage_code`/`stage_name` to each `build_requirement_preview` row (trivial, no arithmetic change) + the two new read-only aggregation views (stage-wise grouping, aggregated-by-material-and-unit grouping using exact `Fraction` summation).
6. **Frontend: stage tabs in `RevisionView`/`MaterialTable`** (Section G) — additive UI, zero change to the zero-stage path.
7. **Frontend: aggregated/stage views in `RequirementCalculator`** (Section G).
8. **BMR: `stage_id`/`stage_name` snapshot fields on `BMRLine` + stage-grouped `BmrPanel` rendering** (Section D/G) — additive, no change to today's four-editable-field model.
9. **CSV import: four new optional columns** (Section F) — last, since it's the lowest-priority, most isolated slice and benefits from the model/service work above already being settled.

---

## J. The smallest safe next implementation task and acceptance tests

**Smallest safe slice: #1 + #2 from Section I (the two additive schema changes) with zero service/API/frontend wiring yet** — i.e. land the `FormulaStage` model and `FormulaLine.stage` column, fully tested in isolation, before touching any service, serializer, or UI code.

Acceptance tests for that slice specifically:

- Migration applies cleanly against the existing `cmhp_new_dev` database with zero data changes to any existing `Formula`/`FormulaRevision`/`FormulaLine` row (every existing line's new `stage_id` is `null`).
- `FormulaStage.clean()` rejects: a stage whose `revision.status != DRAFT`; a second `is_final=True` row for the same revision (constraint-level, verified via `IntegrityError`); a `depends_on` edge to a stage in a different revision; a `depends_on` cycle (direct two-stage cycle and a longer three-stage cycle, both rejected).
- `FormulaLine.stage` accepts `null` unconditionally (today's behavior, unchanged) and, once any `FormulaStage` exists for its revision, a service-level check (not yet wired to any endpoint in this slice, but unit-tested directly against the model/service function in isolation) rejects a line with `stage=None` in a staged revision and a line whose `stage.revision_id` doesn't match its own `revision_id`.
- `apps.formulas.requirement_preview.build_requirement_preview` run against a revision with stages present still returns identical `required_quantity` values to the same revision with its lines simply unstaged (i.e., prove via a direct test that adding stage structure changes zero arithmetic) — this is the concrete regression test for Section E's central claim.
- Every existing `tests/test_formulas.py`, `tests/test_formula_approval.py`, and `tests/test_formula_requirement_preview.py` test continues to pass unmodified (the strongest possible proof that this slice is additive).

---

## Final response

**What can be reused:** the entire exact-`Fraction` requirement calculator, the DRAFT-only mutability/approval/contributor machinery, the lock-order discipline, and three existing frontend "flat array filtered by an attribute" patterns (`MaterialTable`, `RequirementCalculator`, `BmrPanel`'s `SlipTable`) plus two existing grouping UI primitives (`.pw-tabs`, `.fm-steps`). None of this needs to change its core logic — stages are a label riding on top of the existing flat line list, not a new consumption path.

**What needs to change:** one new additive model (`FormulaStage`) and one new nullable FK column (`FormulaLine.stage`), service-layer CRUD/validation for stages (cycle rejection, DRAFT-only, all-or-nothing staging), passthrough stage fields on the calculator's existing output plus two new read-only aggregation views, stage-aware frontend tabs/grouping in the formula editor and BMR panel, and four new optional CSV columns — all additive, all backward-compatible, verified above to require zero changes to any existing stored data or passing test.

**What remains undecided:** yield/loss/evaporation modeling for intermediate stages, whether partial (vs. whole-preparation) transfers are ever needed, whether BMR should ever gate stage execution, the MaterialRequisition-vs-BMR ordering question (pre-existing, not introduced by this proposal), and whether the approval snapshot should be deepened to capture stage structure explicitly — all five listed verbatim in Section H, none silently assumed anywhere in the design.

**Recommended first implementation slice:** land `FormulaStage` + `FormulaLine.stage` (schema only, Section J) with the five acceptance tests listed there, before writing any service, API, or frontend code — this proves the additive/backward-compatible claim empirically against the real test suite before any user-facing behavior changes at all.
