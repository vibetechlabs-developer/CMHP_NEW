from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "control_samples.view",
        "name": "View control samples",
        "module": "quality",
        "description": "View the company control / retention sample register.",
    },
    {
        "code": "control_samples.create",
        "name": "Log control samples",
        "module": "quality",
        "description": "Register a new control or retention sample for a manufactured batch.",
    },
    {
        "code": "control_samples.edit",
        "name": "Edit control samples",
        "module": "quality",
        "description": "Update control sample details that are not yet disposed.",
    },
    {
        "code": "control_samples.dispose",
        "name": "Dispose control samples",
        "module": "quality",
        "description": "Record SOP disposal of an expired or due control sample.",
    },
]


def seed_permissions(apps, schema_editor):
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
        ("permissions", "0035_seed_material_reorder_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
