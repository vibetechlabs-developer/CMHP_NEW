from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "stock.view",
        "name": "View recorded stock movements",
        "module": "stock_movements",
        "description": (
            "View recorded RECEIPT_IN stock movements and recorded-receipt quantity totals for this store. "
            "These are NOT complete physical stock, available stock, or usable stock - historical receipts are "
            "not backfilled, opening stock is not included, and QC release/reservation/issue/return are not "
            "tracked anywhere in this system yet."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, STORE scope, assigned to no role/user - same pattern as
    0022_seed_material_requisition_permissions.py and every permission-
    seeding migration since 0009_seed_receiving_permissions.py.
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
        ("permissions", "0022_seed_material_requisition_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
