from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "material_requisitions.approve",
        "name": "Approve material requisition",
        "module": "material_requisitions",
        "description": (
            "Decide the one approval step of a SUBMITTED material requisition in favour (Task 15C). Does NOT "
            "reserve stock, issue materials or authorize production - a recorded decision only. Never the "
            "requisition's own creator, the current round's submitter, or anyone who made a substantive "
            "requested-quantity change in the current round - no exception, including for superusers."
        ),
    },
    {
        "code": "material_requisitions.revise",
        "name": "Revise a rejected material requisition",
        "module": "material_requisitions",
        "description": (
            "Reopen a REJECTED material requisition back to DRAFT for correction (Task 15C). Also requires "
            "material_requisitions.view and material_requisitions.edit, since revising reopens editable data - "
            "deliberately not sufficient on its own. Does not itself change any line content; use the existing "
            "PATCH endpoint afterwards."
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
        ("permissions", "0026_seed_material_requisitions_submit_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
