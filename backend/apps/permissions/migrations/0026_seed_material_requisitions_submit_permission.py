from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "material_requisitions.submit",
        "name": "Submit material requisition",
        "module": "material_requisitions",
        "description": (
            "Freeze a DRAFT material requisition as SUBMITTED, awaiting a future processing workflow (Task "
            "15A). Does NOT approve quantities, reserve stock, issue materials, authorize production or release "
            "anything from QC. Deliberately independent of material_requisitions.edit - submitting is a "
            "distinct action from editing, each gated by its own permission."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, STORE scope, assigned to no role/user - same pattern
    as every permission-seeding migration since 0009_seed_receiving_
    permissions.py.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        PermissionDefinition.objects.get_or_create(
            code=entry["code"],
            defaults={
                "name": entry["name"],
                "module": entry["module"],
                "description": entry["description"],
                "scope": "STORE",
                "is_active": True,
            },
        )


def unseed_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        permission = PermissionDefinition.objects.filter(code=entry["code"]).first()
        if permission is None:
            continue
        if permission.store_roles.exists():
            continue
        permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0025_seed_formulas_import_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
