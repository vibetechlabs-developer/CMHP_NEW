from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "purchase_requests.view",
        "name": "View purchase requests",
        "module": "purchasing",
        "description": "View purchase requests raised by this company.",
    },
    {
        "code": "purchase_requests.create",
        "name": "Create purchase requests",
        "module": "purchasing",
        "description": "Create and edit draft purchase requests for this company.",
    },
    {
        "code": "purchase_requests.edit",
        "name": "Edit draft purchase requests",
        "module": "purchasing",
        "description": "Edit an existing draft purchase request for this company.",
    },
    {
        "code": "purchase_requests.submit",
        "name": "Submit purchase requests",
        "module": "purchasing",
        "description": "Submit a draft purchase request for review. Submission is not approval.",
    },
    {
        "code": "purchase_requests.cancel",
        "name": "Cancel purchase requests",
        "module": "purchasing",
        "description": "Cancel a draft or submitted purchase request.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the five COMPANY-scope permissions Task
    08B-1 needs - mirrors 0004_seed_catalog_and_location_permissions.py's
    get_or_create pattern exactly. Neither assigned to any role nor to
    any user here - provisioning the permission definitions and granting
    access remain two separate actions, same as every prior permission-
    seeding migration in this project.
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
    """Reverse only removes a row if nothing already references it - same
    caution as every prior permission-seeding migration's reverse.
    """
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
        ("permissions", "0004_seed_catalog_and_location_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
