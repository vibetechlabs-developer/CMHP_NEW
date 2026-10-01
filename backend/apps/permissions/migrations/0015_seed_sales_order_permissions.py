from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "sales_orders.view",
        "name": "View sales orders",
        "module": "sales_orders",
        "description": "View a company's direct sales order drafts.",
    },
    {
        "code": "sales_orders.create",
        "name": "Create sales orders",
        "module": "sales_orders",
        "description": "Create a new direct sales order draft under a company.",
    },
    {
        "code": "sales_orders.edit",
        "name": "Edit sales orders",
        "module": "sales_orders",
        "description": "Edit a draft sales order's header and lines.",
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
        ("permissions", "0014_seed_quotation_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
