from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0003_product_bmr_no"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="pack_size",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
