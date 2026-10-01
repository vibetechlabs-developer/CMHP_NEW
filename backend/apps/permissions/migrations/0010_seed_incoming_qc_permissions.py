from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "incoming_qc.view",
        "name": "View incoming QC inspections",
        "module": "quality",
        "description": "View incoming QC inspection drafts recorded at this store.",
    },
    {
        "code": "incoming_qc.create",
        "name": "Create incoming QC inspections",
        "module": "quality",
        "description": (
            "Create a draft incoming QC inspection against a posted goods-receipt line at this "
            "store. Creating an inspection records that observations are being taken only - it "
            "does not accept, reject, or release any material."
        ),
    },
    {
        "code": "incoming_qc.edit",
        "name": "Edit incoming QC inspections",
        "module": "quality",
        "description": "Edit an existing draft incoming QC inspection (date, notes, observations) at this store.",
    },
    {
        "code": "incoming_qc.cancel",
        "name": "Cancel incoming QC inspections",
        "module": "quality",
        "description": "Cancel a draft incoming QC inspection at this store. A cancelled draft may be replaced by a new one.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the four STORE-scope permissions Task
    09B-1 needs - mirrors 0009_seed_receiving_permissions.py's
    get_or_create pattern exactly. Neither assigned to any role nor to
    any user here - provisioning the permission definitions and granting
    access to a store's designated QC staff remain two separate actions,
    same as every prior permission-seeding migration in this project.
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
    """Reverse only removes a row if nothing already references it - same
    caution as every prior permission-seeding migration's reverse.
    """
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
        ("permissions", "0009_seed_receiving_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
