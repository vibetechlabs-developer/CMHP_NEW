from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "formulas.view",
        "name": "View formulas",
        "module": "formulas",
        "description": "View a company's manufacturing formula drafts.",
    },
    {
        "code": "formulas.create",
        "name": "Create formulas",
        "module": "formulas",
        "description": "Create formulas and new draft revisions.",
    },
    {
        "code": "formulas.edit",
        "name": "Edit formulas",
        "module": "formulas",
        "description": "Edit formula metadata and draft revision content.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as 0012-0014.
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
        ("permissions", "0015_seed_sales_order_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
