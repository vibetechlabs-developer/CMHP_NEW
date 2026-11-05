# Generated manually for company-scoped control / retention samples.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("batch_plans", "0004_phase_b_department_fields"),
        ("products", "0004_product_pack_size"),
        ("quality", "0004_materialspecification_version"),
        ("sales_orders", "0003_phase_b_department_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ControlSample",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("batch_no", models.CharField(max_length=100)),
                ("product_code", models.CharField(blank=True, max_length=32)),
                ("product_name", models.CharField(max_length=255)),
                ("pack_size", models.CharField(blank=True, max_length=100)),
                ("sample_qty", models.DecimalField(decimal_places=3, max_digits=14)),
                ("unit", models.CharField(default="Bottles", max_length=40)),
                (
                    "sample_type",
                    models.CharField(
                        choices=[
                            ("RETENTION", "Retention / Control Room"),
                            ("QC_TESTING", "QC Testing Sample"),
                        ],
                        default="RETENTION",
                        max_length=20,
                    ),
                ),
                ("storage_location", models.CharField(blank=True, max_length=255)),
                ("ar_no", models.CharField(blank=True, max_length=100)),
                ("mfg_date", models.DateField(blank=True, null=True)),
                ("exp_date", models.DateField(blank=True, null=True)),
                ("tested_by", models.CharField(blank=True, max_length=255)),
                ("notes", models.CharField(blank=True, max_length=2000)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("ACTIVE", "Active"),
                            ("DUE_DISPOSAL", "Due for disposal"),
                            ("DISPOSED", "Disposed"),
                        ],
                        default="ACTIVE",
                        max_length=20,
                    ),
                ),
                ("fg_deducted", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("disposed_at", models.DateTimeField(blank=True, null=True)),
                ("disposal_remarks", models.CharField(blank=True, max_length=2000)),
                (
                    "batch_plan",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="control_samples",
                        to="batch_plans.batchplan",
                    ),
                ),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="control_samples",
                        to="companies.company",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="control_samples_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "disposed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="control_samples_disposed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="control_samples",
                        to="products.product",
                    ),
                ),
                (
                    "sales_order",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="control_samples",
                        to="sales_orders.salesorder",
                    ),
                ),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
