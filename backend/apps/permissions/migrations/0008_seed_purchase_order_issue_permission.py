from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "purchase_orders.issue",
        "name": "Issue purchase orders",
        "module": "purchasing",
        "description": (
            "Finalize (issue) a draft purchase order for this company. Task 08C-2 proposed policy, "
            "not yet client-confirmed: holding this one company-scoped permission is sufficient to "
            "issue - there is no separate multi-step commercial approval workflow for a purchase "
            "order the way PurchaseRequest has one (Task 08B-2). Issuing is internal finalization "
            "only - it is not proof of supplier delivery, email transmission, supplier acceptance, "
            "or material receipt."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotently provisions the one COMPANY-scope permission Task
    08C-2 needs - mirrors every prior permission-seeding migration's
    get_or_create pattern exactly. Not assigned to any role nor to any
    user here - provisioning the permission definition and granting
    access to a company's designated issuer remain two separate actions.
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
        ("permissions", "0007_seed_purchase_order_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
