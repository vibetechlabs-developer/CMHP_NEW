from django.db import migrations


PERMISSION_CODE = "shared_store.view"


def seed_shared_store_view(apps, schema_editor):
    """Idempotently provision the one operational store permission this
    task needs, the same way a reference-data seed is normally introduced
    in this project (a RunPython data migration using get_or_create, so
    re-running `migrate` on a database that already has this row is a
    no-op, not a duplicate/IntegrityError). No other permission is seeded
    here - store/stock/QC/purchase permissions beyond `shared_store.view`
    are explicitly out of scope for this task and are not guessed at.

    Deliberately does NOT grant this permission to any role or user -
    provisioning the catalog entry and granting access are two separate
    actions; this migration only guarantees the entry exists.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    PermissionDefinition.objects.get_or_create(
        code=PERMISSION_CODE,
        defaults={
            "name": "View shared store",
            "module": "shared_store",
            "description": "View shared store identity and overview information.",
            "scope": "STORE",
            "is_active": True,
        },
    )


def unseed_shared_store_view(apps, schema_editor):
    """Reverse only removes the row if nothing already references it -
    mirrors the caution any reference-data reversal needs; a role that
    already has this permission assigned would otherwise silently lose it
    on a migration rollback.
    """
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    permission = PermissionDefinition.objects.filter(code=PERMISSION_CODE).first()
    if permission is None:
        return
    if permission.store_roles.exists():
        return
    permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0002_permissiondefinition_scope_storerole_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_shared_store_view, unseed_shared_store_view),
    ]
