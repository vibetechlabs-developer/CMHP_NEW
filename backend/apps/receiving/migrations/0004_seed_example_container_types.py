from django.db import migrations

# Examples named explicitly in the business brief - not an exhaustive or
# client-confirmed catalog. An administrator can add, rename (description
# only - code is immutable) or deactivate further container types through
# the real /api/v1/container-types/ API; this migration only guarantees
# these starting entries exist, the same idempotent-seed convention every
# other reference-data seed migration in this project uses.
EXAMPLE_CONTAINER_TYPES = [
    ("BAG", "Bag"),
    ("DRUM", "Drum"),
    ("TIN", "Tin"),
    ("BOTTLE", "Bottle"),
    ("BOX", "Box"),
    ("OTHER", "Other"),
]


def seed_example_container_types(apps, schema_editor):
    ContainerType = apps.get_model("receiving", "ContainerType")
    for code, name in EXAMPLE_CONTAINER_TYPES:
        ContainerType.objects.get_or_create(code=code, defaults={"name": name, "is_active": True})


def unseed_example_container_types(apps, schema_editor):
    """Reverse only removes a row if nothing already references it -
    mirrors every other reference-data seed's reversal caution in this
    project (e.g. apps.permissions.migrations' unseed_* functions).
    """
    ContainerType = apps.get_model("receiving", "ContainerType")
    for code, _name in EXAMPLE_CONTAINER_TYPES:
        container_type = ContainerType.objects.filter(code=code).first()
        if container_type is None:
            continue
        if container_type.goods_receipt_lines.exists() or container_type.materials_default.exists():
            continue
        container_type.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("receiving", "0003_container_type_lifecycle_and_invoice_reference"),
    ]

    operations = [
        migrations.RunPython(seed_example_container_types, unseed_example_container_types),
    ]
