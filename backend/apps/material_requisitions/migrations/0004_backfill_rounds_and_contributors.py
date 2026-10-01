"""Task 15C: migration strategy for MaterialRequisitions that were already
SUBMITTED before this task existed (Task 15A/15B/15B.1/15B.2 had no
approve/reject/revise concept, and no MaterialRequisitionRound at all).

For every existing row:
- A `DRAFT` requisition has, by construction, never been submitted under
  any code that ever existed before this migration - `current_round`
  correctly stays at its default (0); nothing else is created for it.
- A `SUBMITTED` requisition gets exactly ONE `MaterialRequisitionRound`
  (round_number=1, outcome=PENDING), reusing its EXISTING, already-
  reliable `submitted_by`/`submitted_at` header fields (never guessed,
  never recomputed) and copying every current line into a matching
  `MaterialRequisitionRoundLine` - this is the historical snapshot that
  would otherwise only exist for requisitions submitted AFTER this
  migration. No legacy row is ever marked APPROVED or REJECTED by this
  migration - only PENDING, exactly reflecting the real, honest state
  that no decision had been recorded yet.

CONTRIBUTOR RECONSTRUCTION - reliable evidence only, never invented:
`apps.material_requisitions.services.create_material_requisition`/
`update_material_requisition` have UNCONDITIONALLY written one audit
event (via `apps.audit.services.record`) for every create and every real
change since Task 13A - there has never been a code path in this app that
changes a line's `requested_quantity` without auditing it. This migration
replays that audit trail, per requisition, in chronological order: the
`created` event's own actor is attributed to every line whose initial
`requested_quantity` was non-null; each later `updated` event's `before`/
`after` line pairs are compared field-by-field, and the acting user is
attributed to any line whose `requested_quantity` actually differs between
them (a remark-only or no-op edit never reattributes a line, matching the
live service's own behaviour exactly).

After replay, the migration cross-checks its own reconstruction: the
requested_quantity the audit trail implies for each line must match that
line's REAL, current value in the database. A mismatch means something
changed this row outside any audited path (direct SQL, a Django shell
session, or similar) - the reconstruction cannot be trusted for that
round, so its `contributor_provenance_complete` is left `False` (fail
closed) and NO contributor is attributed to any of its lines, rather than
guessing. A round that passes the cross-check is marked
`contributor_provenance_complete=True` and its lines carry the
reconstructed contributor - this is reliable evidence, not a fabrication,
precisely because it was proven consistent with the row's own real state.

This migration only ever ADDS rows (`MaterialRequisitionRound`/
`MaterialRequisitionRoundLine`) and sets `MaterialRequisition.
current_round`/`MaterialRequisitionLine.requested_quantity_contributor`/
`requested_quantity_contributed_at` on EXISTING rows - it never changes
`status`, `submitted_by`, `submitted_at`, or any quantity value. The
reverse migration deletes only the rows this migration itself would have
created and resets only the fields it itself would have set.
"""
from django.db import migrations


def _line_requested_quantity(entry):
    raw = entry.get("requested_quantity")
    return None if raw is None else str(raw)


def backfill(apps, schema_editor):
    MaterialRequisition = apps.get_model("material_requisitions", "MaterialRequisition")
    MaterialRequisitionLine = apps.get_model("material_requisitions", "MaterialRequisitionLine")
    MaterialRequisitionRound = apps.get_model("material_requisitions", "MaterialRequisitionRound")
    MaterialRequisitionRoundLine = apps.get_model("material_requisitions", "MaterialRequisitionRoundLine")
    AuditLog = apps.get_model("audit", "AuditLog")

    submitted_requisitions = MaterialRequisition.objects.filter(status="SUBMITTED")
    for requisition in submitted_requisitions.iterator():
        lines = list(MaterialRequisitionLine.objects.filter(requisition=requisition).order_by("line_number"))
        current_by_id = {line.id: line for line in lines}

        events = list(
            AuditLog.objects.filter(target_type="material_requisition", target_id=requisition.id)
            .filter(action__in=["material_requisition.created", "material_requisition.updated"])
            .order_by("created_at", "id")
        )

        contributor_id_by_line = {}
        contributed_at_by_line = {}
        implied_quantity_by_line = {}

        for event in events:
            after = (event.after or {})
            if event.action == "material_requisition.created":
                for entry in after.get("lines", []):
                    line_id = entry.get("id")
                    if line_id is None:
                        continue
                    qty = _line_requested_quantity(entry)
                    implied_quantity_by_line[line_id] = qty
                    if qty is not None:
                        contributor_id_by_line[line_id] = event.actor_id
                        contributed_at_by_line[line_id] = event.created_at
            else:
                before_lines = (event.before or {}).get("lines", [])
                after_lines = after.get("lines", [])
                for before_entry, after_entry in zip(before_lines, after_lines):
                    line_id = after_entry.get("id")
                    if line_id is None:
                        continue
                    new_qty = _line_requested_quantity(after_entry)
                    implied_quantity_by_line[line_id] = new_qty
                    old_qty = _line_requested_quantity(before_entry)
                    if new_qty != old_qty:
                        contributor_id_by_line[line_id] = event.actor_id
                        contributed_at_by_line[line_id] = event.created_at

        reconstruction_reliable = True
        for line in lines:
            implied = implied_quantity_by_line.get(line.id, "__NO_EVIDENCE__")
            actual = None if line.requested_quantity is None else str(line.requested_quantity)
            if implied == "__NO_EVIDENCE__" or implied != actual:
                reconstruction_reliable = False
                break

        round_obj = MaterialRequisitionRound.objects.create(
            requisition=requisition,
            round_number=1,
            notes_snapshot=requisition.notes,
            source_plan_version_snapshot=requisition.source_plan_version_snapshot,
            target_output_quantity_snapshot=requisition.target_output_quantity_snapshot,
            formula_revision_id_snapshot=requisition.formula_revision_id_snapshot,
            formula_revision_version_snapshot=requisition.formula_revision_version_snapshot,
            submitted_by_id=requisition.submitted_by_id,
            submitted_at=requisition.submitted_at,
            outcome="PENDING",
            contributor_provenance_complete=reconstruction_reliable,
        )

        round_lines = []
        for line in lines:
            contributor_id = contributor_id_by_line.get(line.id) if reconstruction_reliable else None
            contributed_at = contributed_at_by_line.get(line.id) if reconstruction_reliable else None
            round_lines.append(
                MaterialRequisitionRoundLine(
                    round=round_obj,
                    line_number=line.line_number,
                    material_id=line.material_id,
                    unit_id=line.unit_id,
                    material_code_snapshot=line.material_code_snapshot,
                    material_name_snapshot=line.material_name_snapshot,
                    material_kind_snapshot=line.material_kind_snapshot,
                    unit_code_snapshot=line.unit_code_snapshot,
                    unit_name_snapshot=line.unit_name_snapshot,
                    base_line_quantity_snapshot=line.base_line_quantity_snapshot,
                    calculation_snapshot=line.calculation_snapshot,
                    requested_quantity=line.requested_quantity,
                    quantity_remark=line.quantity_remark,
                    requested_quantity_contributor_id=contributor_id,
                    requested_quantity_contributed_at=contributed_at,
                )
            )
            if reconstruction_reliable:
                line.requested_quantity_contributor_id = contributor_id
                line.requested_quantity_contributed_at = contributed_at
        MaterialRequisitionRoundLine.objects.bulk_create(round_lines)
        if reconstruction_reliable:
            MaterialRequisitionLine.objects.bulk_update(
                lines, ["requested_quantity_contributor", "requested_quantity_contributed_at"]
            )

        requisition.current_round = 1
        requisition.save(update_fields=["current_round"])


def unbackfill(apps, schema_editor):
    MaterialRequisition = apps.get_model("material_requisitions", "MaterialRequisition")
    MaterialRequisitionLine = apps.get_model("material_requisitions", "MaterialRequisitionLine")
    MaterialRequisitionRound = apps.get_model("material_requisitions", "MaterialRequisitionRound")

    MaterialRequisitionLine.objects.filter(requisition__status="SUBMITTED", requisition__current_round=1).update(
        requested_quantity_contributor=None, requested_quantity_contributed_at=None
    )
    MaterialRequisitionRound.objects.filter(round_number=1, requisition__status="SUBMITTED").delete()
    MaterialRequisition.objects.filter(status="SUBMITTED", current_round=1).update(current_round=0)


class Migration(migrations.Migration):

    dependencies = [
        ("material_requisitions", "0003_materialrequisition_current_round_and_more"),
        ("audit", "0002_auditlog_store"),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
