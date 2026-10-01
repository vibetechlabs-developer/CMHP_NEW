from django.db import migrations


def migrate_submitted_requests_to_round_one(apps, schema_editor):
    """Task 08B-2 introduces the approval round/step model on top of
    Task 08B-1's already-shipped SUBMITTED status. Any purchase request
    that reached SUBMITTED before this migration ran has no
    PurchaseRequestApprovalRound row yet and `current_round=0`/
    `current_step=None` (the model-level defaults applied by the
    previous migration) - to the new approval code, that would look
    identical to a DRAFT that was never submitted, and approve_purchase_
    request/reject_purchase_request would refuse to act on it (status
    check passes, but there would be no round row to lock).

    This additively backfills exactly what submit_purchase_request would
    have written had the approval workflow existed at the time: one
    PurchaseRequestApprovalRound(round_number=1, outcome=PENDING) per
    already-SUBMITTED request, using its own submitted_by/submitted_at/
    required_by/notes as the round's snapshot, one
    PurchaseRequestApprovalRoundLine per existing line - copying the
    material_code_snapshot/material_name_snapshot/unit_code_snapshot/
    unit_name_snapshot fields Task 08B-1's submit_purchase_request had
    already frozen onto each PurchaseRequestLine - and sets
    current_round=1, current_step=1 on the header, so every pre-existing
    SUBMITTED request starts approval at round 1, step 1, exactly like a
    request submitted for the first time after this migration. DRAFT and
    CANCELLED requests are untouched (no round exists for them either way
    - a DRAFT never started an approval round, and Task 08B-1's cancel
    endpoint did not require one to have existed first).

    Reverse deletes only the round rows this migration itself created
    (round_number=1, outcome still PENDING - i.e. untouched by any
    approval decision since) and resets current_round/current_step back
    to the pre-migration defaults on exactly those requests; a round this
    migration created that has since been approved/rejected/cancelled by
    real approval activity is left alone, since reversing that would
    silently discard real decisions.
    """
    PurchaseRequest = apps.get_model("purchasing", "PurchaseRequest")
    PurchaseRequestApprovalRound = apps.get_model("purchasing", "PurchaseRequestApprovalRound")
    PurchaseRequestApprovalRoundLine = apps.get_model("purchasing", "PurchaseRequestApprovalRoundLine")

    submitted_requests = PurchaseRequest.objects.filter(status="SUBMITTED", current_round=0).prefetch_related(
        "lines"
    )
    for purchase_request in submitted_requests:
        approval_round = PurchaseRequestApprovalRound.objects.create(
            purchase_request=purchase_request,
            round_number=1,
            required_by_snapshot=purchase_request.required_by,
            notes_snapshot=purchase_request.notes,
            submitted_by_id=purchase_request.submitted_by_id,
            submitted_at=purchase_request.submitted_at,
            outcome="PENDING",
        )
        PurchaseRequestApprovalRoundLine.objects.bulk_create(
            [
                PurchaseRequestApprovalRoundLine(
                    round=approval_round,
                    line_number=line.line_number,
                    material_id=line.material_id,
                    unit_id=line.unit_id,
                    quantity=line.quantity,
                    notes=line.notes,
                    material_code_snapshot=line.material_code_snapshot,
                    material_name_snapshot=line.material_name_snapshot,
                    unit_code_snapshot=line.unit_code_snapshot,
                    unit_name_snapshot=line.unit_name_snapshot,
                )
                for line in purchase_request.lines.all()
            ]
        )
        purchase_request.current_round = 1
        purchase_request.current_step = 1
        purchase_request.save(update_fields=["current_round", "current_step"])


def revert_round_one_backfill(apps, schema_editor):
    PurchaseRequest = apps.get_model("purchasing", "PurchaseRequest")
    PurchaseRequestApprovalRound = apps.get_model("purchasing", "PurchaseRequestApprovalRound")

    backfilled_rounds = PurchaseRequestApprovalRound.objects.filter(round_number=1, outcome="PENDING")
    purchase_request_ids = list(backfilled_rounds.values_list("purchase_request_id", flat=True))
    backfilled_rounds.delete()
    PurchaseRequest.objects.filter(id__in=purchase_request_ids, current_round=1, current_step=1).update(
        current_round=0, current_step=None
    )


class Migration(migrations.Migration):

    dependencies = [
        ("purchasing", "0002_approval_workflow"),
    ]

    operations = [
        migrations.RunPython(migrate_submitted_requests_to_round_one, revert_round_one_backfill),
    ]
