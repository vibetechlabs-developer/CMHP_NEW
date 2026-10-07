from django.db import migrations


def import_existing_product_types(apps, schema_editor):
    """Create one lookup row per distinct, non-blank value already stored on a
    product. Values are imported exactly as stored - variants such as
    "Tablet" and "tablet" stay separate rows and are never merged here.
    """
    Product = apps.get_model("products", "Product")
    ProductType = apps.get_model("catalog", "ProductType")
    values = (
        Product.objects.exclude(product_type="")
        .values_list("product_type", flat=True)
        .distinct()
    )
    for raw in sorted({(value or "").strip() for value in values} - {""}):
        ProductType.objects.get_or_create(name=raw)


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_phase_b_department_fields"),
        ("products", "0002_product_product_type"),
    ]

    operations = [
        migrations.RunPython(import_existing_product_types, migrations.RunPython.noop),
    ]
