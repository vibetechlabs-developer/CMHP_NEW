from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "quotations.view",
        "name": "View quotations",
        "module": "quotations",
        "description": "View a company's quotation drafts.",
    },
    {
        "code": "quotations.create",
        "name": "Create quotations",
        "module": "quotations",
        "description": "Create a new quotation draft under a company.",
    },
    {
        "code": "quotations.edit",
        "name": "Edit quotations",
        "module": "quotations",
        "description": "Edit a draft quotation's header and lines.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as 0012/0013.
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
        ("permissions", "0013_seed_product_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
