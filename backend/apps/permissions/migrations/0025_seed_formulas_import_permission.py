from django.db import migrations


NEW_PERMISSIONS = [
    {
        "code": "formulas.import",
        "name": "Import formula drafts from CSV",
        "module": "formula_imports",
        "description": (
            "Preview and commit a CSV import of brand-new Formula identities, each with its own DRAFT revision 1 "
            "and material lines (Task 14B). Never adds a revision to an existing formula, never approves "
            "anything. Always required together with formulas.view, formulas.create AND shared_catalog.view (in "
            "at least one active store) - it never substitutes for any of them."
        ),
    },
]


def seed_permissions(apps, schema_editor):
    """Idempotent, COMPANY scope, assigned to no role/user - same pattern
    as every permission-seeding migration since 0009_seed_receiving_
    permissions.py.
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
        ("permissions", "0024_seed_products_import_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
