from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "receiving.view",
        "name": "View goods receipts",
        "module": "receiving",
        "description": "View goods receipts recorded at this store.",
    },
    {
        "code": "receiving.create",
        "name": "Create goods receipts",
        "module": "receiving",
        "description": "Create and edit draft goods receipts against an ISSUED purchase order at this store.",
    },
    {
        "code": "receiving.edit",
        "name": "Edit draft goods receipts",
        "module": "receiving",
        "description": "Edit an existing draft goods receipt at this store.",
    },
    {
        "code": "receiving.post",
        "name": "Post goods receipts",
        "module": "receiving",
        "description": (
            "Post a draft goods receipt to confirm physical arrival. Posting is internal "
            "finalization of physical arrival only - it does not create available stock, QC "
            "acceptance, accounting entries, or supplier payments."
        ),
    },
    {
        "code": "receiving.cancel",
        "name": "Cancel goods receipts",
        "module": "receiving",
        "description": "Cancel a draft goods receipt at this store. A posted receipt can never be cancelled.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the five STORE-scope permissions Task 09A
    needs - mirrors 0004_seed_catalog_and_location_permissions.py's
    get_or_create pattern exactly. Neither assigned to any role nor to
    any user here - provisioning the permission definitions and granting
    access to a store's designated receiving staff remain two separate
    actions, same as every prior permission-seeding migration in this
    project.
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
        ("permissions", "0008_seed_purchase_order_issue_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
