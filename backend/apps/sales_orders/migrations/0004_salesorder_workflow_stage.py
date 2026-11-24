from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_orders", "0003_phase_b_department_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesorder",
            name="workflow_stage",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]
