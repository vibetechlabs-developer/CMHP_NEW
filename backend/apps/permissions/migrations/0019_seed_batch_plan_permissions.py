from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "batch_plans.view",
        "name": "View batch plans",
        "module": "batch_plans",
        "description": (
            "View manufacturing batch planning drafts, summaries and requirement previews. "
            "A plan is not an official batch number or production approval."
        ),
    },
    {
        "code": "batch_plans.create",
        "name": "Create batch plans",
        "module": "batch_plans",
        "description": (
            "Create a draft batch plan referencing a sales order line and approved formula revision. "
            "Does not reserve stock, allocate inventory or authorize manufacturing."
        ),
    },
    {
        "code": "batch_plans.edit",
        "name": "Edit draft batch plans",
        "module": "batch_plans",
        "description": (
            "Edit mutable fields (target output quantity, planned date, packing note, notes) on a draft batch plan."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as 0012-0018.
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
        ("permissions", "0018_seed_formula_approve_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
