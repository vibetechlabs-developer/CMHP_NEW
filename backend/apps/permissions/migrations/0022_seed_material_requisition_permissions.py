from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "material_requisitions.view",
        "name": "View material requisitions",
        "module": "material_requisitions",
        "description": (
            "View DRAFT material requisitions - planning documents requesting materials from this store for an "
            "existing batch plan. Does not reserve, issue or consume any stock (no such concept exists)."
        ),
    },
    {
        "code": "material_requisitions.create",
        "name": "Create material requisitions",
        "module": "material_requisitions",
        "description": (
            "Create a DRAFT material requisition for an existing batch plan at this store, auto-fetched from the "
            "plan's approved formula revision. Does not authorize manufacturing or affect any stock."
        ),
    },
    {
        "code": "material_requisitions.edit",
        "name": "Edit material requisitions",
        "module": "material_requisitions",
        "description": (
            "Edit an existing DRAFT material requisition's notes and requested quantities at this store. A manually "
            "entered requested quantity is a proposed request only, never an approved rounding/loss/wastage rule."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, STORE scope, assigned to no role/user - same pattern as
    0020_seed_store_preparation_permissions.py and every permission-seeding
    migration since.
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
        ("permissions", "0021_seed_batch_plan_allocate_number_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
