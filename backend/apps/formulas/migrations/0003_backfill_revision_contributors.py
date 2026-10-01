from django.db import migrations


def backfill_contributors(apps, schema_editor):
    """Task 11C backfill of `FormulaRevisionContributor` and
    `contributor_history_complete` for revisions that existed before
    contributor tracking. ONLY reliable existing history is used:

    - The creation event is the audit row written in the creation
      transaction: `formula.created` (target formula, revision 1 is its
      `first_revision`) or `formula_revision.created` (target the revision).
    - Every substantive content edit wrote exactly one
      `formula_revision.updated` audit row and bumped `FormulaRevision.version`
      by exactly one, in the same transaction; no-op edits wrote neither.

    Recovered identities: the creator (`created_by`, also required to match
    the creation event's actor) and the actor of every update event. A
    revision is marked `contributor_history_complete=True` ONLY when the
    creation event exists with the same actor as `created_by` AND
    `version - 1` equals the number of update events (so the audit trail
    provably accounts for every content change). Anything else stays
    incomplete (False): authorship is never inferred from `created_by`
    alone, and there is no manual "mark complete" path. Existing revision
    content and audit rows are only read, never modified. Idempotent.
    """
    FormulaRevision = apps.get_model("formulas", "FormulaRevision")
    Contributor = apps.get_model("formulas", "FormulaRevisionContributor")
    AuditLog = apps.get_model("audit", "AuditLog")

    for revision in FormulaRevision.objects.all().iterator():
        if revision.revision_number == 1:
            creation_events = AuditLog.objects.filter(
                action="formula.created", target_type="formula", target_id=revision.formula_id
            )
        else:
            creation_events = AuditLog.objects.filter(
                action="formula_revision.created", target_type="formula_revision", target_id=revision.id
            )
        creation_actor_ids = set(creation_events.values_list("actor_id", flat=True))
        update_actor_ids = list(
            AuditLog.objects.filter(
                action="formula_revision.updated", target_type="formula_revision", target_id=revision.id
            ).values_list("actor_id", flat=True)
        )

        Contributor.objects.get_or_create(revision=revision, user_id=revision.created_by_id)
        for actor_id in set(update_actor_ids):
            Contributor.objects.get_or_create(revision=revision, user_id=actor_id)

        complete = (
            creation_actor_ids == {revision.created_by_id}
            and revision.version - 1 == len(update_actor_ids)
        )
        FormulaRevision.objects.filter(pk=revision.pk).update(contributor_history_complete=complete)


class Migration(migrations.Migration):

    dependencies = [
        ("formulas", "0002_formula_approval_foundation"),
        ("audit", "0002_auditlog_store"),
    ]

    operations = [
        migrations.RunPython(backfill_contributors, migrations.RunPython.noop),
    ]
