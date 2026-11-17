from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "batch_quality.view",
        "name": "View batch quality cases",
        "module": "quality",
        "description": "View batch quality cases, decisions, and release history.",
    },
    {
        "code": "batch_quality.qc_decide",
        "name": "Record batch QC decisions",
        "module": "quality",
        "description": "Record QC approval, rejection, or hold on manufactured batch quality cases.",
    },
    {
        "code": "batch_quality.qa_release",
        "name": "Authorize batch QA release",
        "module": "quality",
        "description": "Authorize QA release for batches with approved QC.",
    },
    {
        "code": "batch_quality.coa_record",
        "name": "Record COA documents",
        "module": "quality",
        "description": "Open COA tracking and record Certificate of Analysis document decisions.",
    },
    {
        "code": "batch_quality.packaging_qa",
        "name": "Authorize packaging QA",
        "module": "quality",
        "description": "Mark batch packaging complete and record packaging QA disposition.",
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
        ("permissions", "0036_seed_control_sample_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]

