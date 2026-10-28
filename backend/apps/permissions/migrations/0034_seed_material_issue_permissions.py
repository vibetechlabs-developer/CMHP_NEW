from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "stock_issue.view",
        "name": "View material issues",
        "module": "stock_movements",
        "description": "View material issue documents recorded at this store.",
    },
    {
        "code": "stock_issue.create",
        "name": "Create material issues",
        "module": "stock_movements",
        "description": "Create and edit draft material-issue documents at this store.",
    },
    {
        "code": "stock_issue.edit",
        "name": "Edit draft material issues",
        "module": "stock_movements",
        "description": "Edit an existing draft material-issue document at this store.",
    },
    {
        "code": "stock_issue.post",
        "name": "Post material issues",
        "module": "stock_movements",
        "description": (
            "Post a draft material issue, reducing the recorded net balance for that material/unit/"
            "source company at this store. Posting is a ledger entry only - it does not decide QC "
            "release, reservation, or usable-stock eligibility, and does not post any accounting entry."
        ),
    },
    {
        "code": "stock_issue.cancel",
        "name": "Cancel material issues",
        "module": "stock_movements",
        "description": "Cancel a draft material-issue document at this store. A posted issue can never be cancelled.",
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the five STORE-scope permissions the real
    Issue Outward workflow needs - mirrors 0009_seed_receiving_
    permissions.py's get_or_create pattern exactly. Neither assigned to
    any role nor to any user here - provisioning the permission
    definitions and granting access to a store's designated issuing
    staff remain two separate actions, same as every prior permission-
    seeding migration in this project. Granting none of this to any
    live role preserves every existing user's current access unchanged.
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
        ("permissions", "0033_seed_formulas_submit_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
