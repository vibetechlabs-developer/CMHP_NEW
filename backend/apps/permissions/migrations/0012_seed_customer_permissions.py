from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "customers.view",
        "name": "View customers",
        "module": "customers",
        "description": "View a company's customer directory.",
    },
    {
        "code": "customers.create",
        "name": "Create customers",
        "module": "customers",
        "description": "Create a new customer under a company.",
    },
    {
        "code": "customers.edit",
        "name": "Edit customers",
        "module": "customers",
        "description": "Edit an existing customer's metadata (name, contact, addresses, notes).",
    },
    {
        "code": "customers.activate",
        "name": "Activate customers",
        "module": "customers",
        "description": "Reactivate a previously deactivated customer.",
    },
    {
        "code": "customers.deactivate",
        "name": "Deactivate customers",
        "module": "customers",
        "description": "Deactivate a customer. Never deletes the record or frees its code.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the five COMPANY-scope permissions Task
    10A needs - mirrors 0005_seed_purchase_request_permissions.py's
    get_or_create pattern exactly. Not assigned to any role/user here -
    provisioning the permission definitions and granting access to a
    company's staff remain two separate actions, same as every prior
    permission-seeding migration in this project.
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
        ("permissions", "0011_seed_incoming_qc_submit_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
