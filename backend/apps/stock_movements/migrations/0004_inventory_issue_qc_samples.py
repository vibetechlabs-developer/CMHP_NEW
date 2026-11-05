# Generated manually for multi-line issues, lot QC, return disposition, batch/order bind.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("batch_plans", "0004_phase_b_department_fields"),
        ("catalog", "0005_add_default_container_type"),
        ("companies", "0001_initial"),
        ("sales_orders", "0003_phase_b_department_fields"),
        ("stock_movements", "0003_physicalcountdraft_productioncustody_materialreturn_and_more"),
        ("stores", "0002_storagelocation"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MaterialIssueLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("line_number", models.PositiveIntegerField()),
                ("issued_quantity", models.DecimalField(decimal_places=3, max_digits=14)),
                ("material_code_snapshot", models.CharField(blank=True, max_length=32)),
                ("material_name_snapshot", models.CharField(blank=True, max_length=255)),
                ("unit_code_snapshot", models.CharField(blank=True, max_length=20)),
                ("unit_name_snapshot", models.CharField(blank=True, max_length=100)),
                (
                    "material",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="material_issue_lines",
                        to="catalog.material",
                    ),
                ),
                (
                    "material_issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="lines",
                        to="stock_movements.materialissue",
                    ),
                ),
                (
                    "unit",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="material_issue_lines",
                        to="catalog.unitofmeasure",
                    ),
                ),
            ],
            options={"ordering": ["line_number", "id"]},
        ),
        migrations.AddConstraint(
            model_name="materialissueline",
            constraint=models.UniqueConstraint(
                fields=("material_issue", "line_number"), name="unique_material_issue_line_number"
            ),
        ),
        migrations.AddConstraint(
            model_name="materialissueline",
            constraint=models.CheckConstraint(
                check=models.Q(issued_quantity__gt=0), name="material_issue_line_quantity_positive"
            ),
        ),
        migrations.CreateModel(
            name="LotQualityStatus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("APPROVED", "Approved / Released"),
                            ("UNDER_TEST", "Under Test / Quarantine"),
                            ("ON_HOLD", "On Hold"),
                            ("REJECTED", "Rejected"),
                        ],
                        default="APPROVED",
                        max_length=20,
                    ),
                ),
                ("ar_no", models.CharField(blank=True, max_length=100)),
                ("chemist", models.CharField(blank=True, max_length=255)),
                ("remarks", models.CharField(blank=True, max_length=2000)),
                ("decided_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "decided_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="lot_quality_decisions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "stock_movement",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="quality_status",
                        to="stock_movements.stockmovement",
                    ),
                ),
            ],
            options={"ordering": ["-updated_at", "-id"]},
        ),
        migrations.AddField(
            model_name="materialissue",
            name="batch_plan",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="material_issues",
                to="batch_plans.batchplan",
            ),
        ),
        migrations.AddField(
            model_name="materialissue",
            name="sales_order",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="material_issues",
                to="sales_orders.salesorder",
            ),
        ),
        migrations.AddField(
            model_name="materialreturn",
            name="disposition_decided_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="materialreturn",
            name="disposition_reason",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="materialreturn",
            name="disposition_decided_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="material_returns_dispositioned",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="materialissuemovement",
            name="source_material_issue",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="movements",
                to="stock_movements.materialissue",
            ),
        ),
        migrations.AddField(
            model_name="materialissuemovement",
            name="source_line",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="movements",
                to="stock_movements.materialissueline",
            ),
        ),
        migrations.AlterField(
            model_name="productioncustody",
            name="source_issue",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="production_custodies",
                to="stock_movements.materialissue",
            ),
        ),
        migrations.AddField(
            model_name="productioncustody",
            name="source_line",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="production_custodies",
                to="stock_movements.materialissueline",
            ),
        ),
    ]
