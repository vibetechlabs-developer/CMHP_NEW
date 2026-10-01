from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "products.view",
        "name": "View products",
        "module": "products",
        "description": "View a company's saleable product directory.",
    },
    {
        "code": "products.create",
        "name": "Create products",
        "module": "products",
        "description": "Create a new saleable product under a company.",
    },
    {
        "code": "products.edit",
        "name": "Edit products",
        "module": "products",
        "description": "Edit an existing product's metadata (name, description).",
    },
    {
        "code": "products.activate",
        "name": "Activate products",
        "module": "products",
        "description": "Reactivate a previously deactivated product.",
    },
    {
        "code": "products.deactivate",
        "name": "Deactivate products",
        "module": "products",
        "description": "Deactivate a product. Never deletes the record or frees its code.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the five COMPANY-scope permissions Task
    10B needs - mirrors 0012_seed_customer_permissions.py's get_or_create
    pattern exactly. Not assigned to any role/user here - provisioning
    the permission definitions and granting access to a company's staff
    remain two separate actions, same as every prior permission-seeding
    migration in this project.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        PermissionDefinition.objects.get_or_create(
            code=entry["code"],
            defaults={
                "name": entry["name"],
                "module": entry["module"],
                "description": entry["description"],
                "scope": "COMPANY",
                "is_active": True,
            },
        )


def unseed_permissions(apps, schema_editor):
    """Reverse only removes a row if nothing already references it - same
    caution as every prior permission-seeding migration's reverse.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        permission = PermissionDefinition.objects.filter(code=entry["code"]).first()
        if permission is None:
            continue
        if permission.company_roles.exists():
            continue
        permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0012_seed_customer_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
