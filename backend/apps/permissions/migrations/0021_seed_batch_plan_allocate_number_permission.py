from django.db import migrations


def seed_permission(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as 0012-0020.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    PermissionDefinition.objects.get_or_create(
        code="batch_plans.allocate_number",
        defaults={
            "name": "Allocate official batch numbers",
            "module": "batch_plans",
            "description": (
                "Allocate the one official batch number a planning draft will ever receive. A separate "
                "action from formula approval; does not authorize production, reserve stock or issue material."
            ),
            "scope": "COMPANY",
            "is_active": True,
        },
    )


def unseed_permission(apps, schema_editor):
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    permission = PermissionDefinition.objects.filter(code="batch_plans.allocate_number").first()
    if permission is None:
        return
    if permission.company_roles.exists():
        return
    permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0020_seed_store_preparation_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_permission, unseed_permission),
    ]
