from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "purchase_requests.approve",
        "name": "Approve or reject purchase requests",
        "module": "purchasing",
        "description": (
            "Decide (approve or reject) a purchase request at whichever approval step is currently "
            "pending. This is the Task 08B-2 'Business Admin' approval permission - holding it is what "
            "makes someone an approving Admin for this workflow; it does not imply Django is_superuser, "
            "is_staff, or any other role, and the requester can never use it on their own request."
        ),
    },
    {
        "code": "purchase_requests.cancel_pending",
        "name": "Cancel a purchase request pending approval",
        "module": "purchasing",
        "description": (
            "Cancel a purchase request while it is SUBMITTED and awaiting a decision at any approval "
            "step. Separate from purchase_requests.cancel, which only covers a DRAFT request - holding "
            "purchase_requests.cancel alone no longer permits cancelling a SUBMITTED one (Task 08B-2 "
            "closes that gap; see docs/purchase-workflow-proposal.md)."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the two COMPANY-scope permissions Task
    08B-2 needs - mirrors 0005_seed_purchase_request_permissions.py's
    get_or_create pattern exactly. Neither assigned to any role nor to
    any user here - provisioning the permission definitions and granting
    access to a company's designated business Admin role remain two
    separate actions, same as every prior permission-seeding migration in
    this project.
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
        ("permissions", "0005_seed_purchase_request_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
