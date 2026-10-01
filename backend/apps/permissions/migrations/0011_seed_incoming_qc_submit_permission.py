from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "incoming_qc.submit",
        "name": "Submit incoming QC inspections",
        "module": "quality",
        "description": (
            "Submit a draft incoming QC inspection, freezing its observations for review. "
            "Submission does not itself accept, reject, or release any material - it only "
            "means the analyst is done recording observations."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the one STORE-scope permission Task
    09B-3A needs - mirrors 0010_seed_incoming_qc_permissions.py's
    get_or_create pattern exactly. Not assigned to any role/user here -
    provisioning the permission definition and granting access to a
    store's designated QC staff remain two separate actions, same as
    every prior permission-seeding migration in this project.
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
        ("permissions", "0010_seed_incoming_qc_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
