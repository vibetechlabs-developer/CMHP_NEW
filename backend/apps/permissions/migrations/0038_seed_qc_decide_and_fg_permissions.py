from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "incoming_qc.decide",
        "name": "Record incoming material QC decisions",
        "module": "quality",
        "description": "Record QC approval, rejection, or hold decisions for receipt lots at a store.",
        "scope": "STORE",
    },
    {
        "code": "finished_goods.view",
        "name": "View finished goods inventory",
        "module": "quality",
        "description": "View company finished goods stock, batch traceability, and release records.",
        "scope": "COMPANY",
    },
    {
        "code": "finished_goods.post",
        "name": "Post finished goods inventory",
        "module": "quality",
        "description": "Post authorized and QA-approved manufactured batches into finished goods inventory.",
        "scope": "COMPANY",
    },
    {
        "code": "finished_goods.reverse",
        "name": "Reverse finished goods inventory postings",
        "module": "quality",
        "description": "Perform an authorized, audited reversal of a finished goods stock posting.",
        "scope": "COMPANY",
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
                "scope": entry["scope"],
                "is_active": True,
            },
        )


def unseed_permissions(apps, schema_editor):
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    for entry in NEW_PERMISSIONS:
        permission = PermissionDefinition.objects.filter(code=entry["code"]).first()
        if permission is None:
            continue
        if permission.company_roles.exists() or permission.store_roles.exists():
            continue
        permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0037_seed_batch_quality_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]

