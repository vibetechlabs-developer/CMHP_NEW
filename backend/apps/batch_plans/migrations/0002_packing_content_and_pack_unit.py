"""Task 12B-2: structured packing content and a separately-tracked source
pack unit snapshot.

`planned_pack_quantity`/`packing_content_quantity`/`packing_content_uom` are
added nullable and stay nullable - they are genuinely optional (Shape B
only; existing and future Shape-A plans never set them).

`pack_uom_id_snapshot`/`pack_uom_code_snapshot`/`pack_uom_name_snapshot`
are added nullable-with-a-placeholder-default, backfilled from each row's
own `output_uom_*_snapshot` (every plan that predates this migration was
necessarily Shape A - the same unit for both - so this is not a guess, it
is copying an already-true fact forward), then made NOT NULL - the
standard three-step "add nullable, backfill, tighten" migration for a new
required column on a table that may already hold rows. At the time this
was written the table was empty in the project's own dev database, but the
migration is written to be correct against a populated one too.
"""

import django.db.models.deletion
from django.db import migrations, models


def backfill_pack_uom_snapshot(apps, schema_editor):
    BatchPlan = apps.get_model("batch_plans", "BatchPlan")
    BatchPlan.objects.filter(pack_uom_id_snapshot__isnull=True).update(
        pack_uom_id_snapshot=models.F("output_uom_id_snapshot"),
        pack_uom_code_snapshot=models.F("output_uom_code_snapshot"),
        pack_uom_name_snapshot=models.F("output_uom_name_snapshot"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("batch_plans", "0001_initial"),
        ("catalog", "0002_unitofmeasure_canonical_factor_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="batchplan",
            name="planned_pack_quantity",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="batchplan",
            name="packing_content_quantity",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="batchplan",
            name="packing_content_uom",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name="batch_plan_packing_content_uses", to="catalog.unitofmeasure",
            ),
        ),
        migrations.AddField(
            model_name="batchplan",
            name="pack_uom_id_snapshot",
            field=models.PositiveIntegerField(null=True),
        ),
        migrations.AddField(
            model_name="batchplan",
            name="pack_uom_code_snapshot",
            field=models.CharField(max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="batchplan",
            name="pack_uom_name_snapshot",
            field=models.CharField(max_length=100, null=True),
        ),
        migrations.RunPython(backfill_pack_uom_snapshot, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="batchplan",
            name="pack_uom_id_snapshot",
            field=models.PositiveIntegerField(),
        ),
        migrations.AlterField(
            model_name="batchplan",
            name="pack_uom_code_snapshot",
            field=models.CharField(max_length=20),
        ),
        migrations.AlterField(
            model_name="batchplan",
            name="pack_uom_name_snapshot",
            field=models.CharField(max_length=100),
        ),
        migrations.AddConstraint(
            model_name="batchplan",
            constraint=models.CheckConstraint(
                condition=models.Q(("planned_pack_quantity__isnull", True), ("planned_pack_quantity__gt", 0), _connector="OR"),
                name="batch_plan_planned_pack_quantity_positive_when_set",
            ),
        ),
        migrations.AddConstraint(
            model_name="batchplan",
            constraint=models.CheckConstraint(
                condition=models.Q(("packing_content_quantity__isnull", True), ("packing_content_quantity__gt", 0), _connector="OR"),
                name="batch_plan_packing_content_quantity_positive_when_set",
            ),
        ),
    ]
