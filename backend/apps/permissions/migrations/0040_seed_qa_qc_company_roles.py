from django.db import migrations


def seed_qa_qc_roles(apps, schema_editor):
    Company = apps.get_model("companies", "Company")
    CompanyRole = apps.get_model("permissions", "CompanyRole")
    PermissionDefinition = apps.get_model("permissions", "PermissionDefinition")
    SharedStore = apps.get_model("stores", "SharedStore")
    StoreRole = apps.get_model("permissions", "StoreRole")

    QA_PERMS = [
        "batch_quality.view",
        "batch_quality.qa_release",
        "batch_quality.coa_record",
        "batch_quality.packaging_qa",
        "batch_quality.coa_generate",
        "batch_quality.coa_approve",
        "finished_goods.view",
        "finished_goods.post",
        "finished_goods.reverse",
        "formulas.view",
        "formulas.approve",
        "control_samples.view",
        "control_samples.create",
        "control_samples.edit",
        "control_samples.dispose",
    ]

    QC_COMPANY_PERMS = [
        "batch_quality.view",
        "batch_quality.qc_decide",
        "batch_quality.coa_record",
        "batch_quality.coa_generate",
        "finished_goods.view",
        "control_samples.view",
        "control_samples.create",
        "control_samples.edit",
        "control_samples.dispose",
    ]

    QC_STORE_PERMS = [
        "incoming_qc.view",
        "incoming_qc.create",
        "incoming_qc.edit",
        "incoming_qc.submit",
        "incoming_qc.cancel",
        "incoming_qc.decide",
        "stock.view",
        "shared_catalog.view",
    ]

    for company in Company.objects.all():
        qa_role, _ = CompanyRole.objects.get_or_create(
            company=company,
            code="QA_ROLE",
            defaults={
                "name": "Quality Assurance (QA)",
                "description": "Quality Assurance authorization, formula approval, batch release, and COA approval.",
                "is_active": True,
            },
        )
        qa_defs = PermissionDefinition.objects.filter(code__in=QA_PERMS, scope="COMPANY")
        qa_role.permissions.add(*qa_defs)

        qc_role, _ = CompanyRole.objects.get_or_create(
            company=company,
            code="QC_ROLE",
            defaults={
                "name": "Quality Control (QC)",
                "description": "Quality Control inspection, batch testing decisions, and COA generation.",
                "is_active": True,
            },
        )
        qc_defs = PermissionDefinition.objects.filter(code__in=QC_COMPANY_PERMS, scope="COMPANY")
        qc_role.permissions.add(*qc_defs)

    for store in SharedStore.objects.all():
        store_qc, _ = StoreRole.objects.get_or_create(
            store=store,
            code="STORE_QC",
            defaults={
                "name": "Quality Control (QC)",
                "description": "Incoming raw material QC inspection and disposition decisions.",
                "is_active": True,
            },
        )
        store_defs = PermissionDefinition.objects.filter(code__in=QC_STORE_PERMS, scope="STORE")
        store_qc.permissions.add(*store_defs)


def unseed_qa_qc_roles(apps, schema_editor):
    CompanyRole = apps.get_model("permissions", "CompanyRole")
    CompanyRole.objects.filter(code__in=["QA_ROLE", "QC_ROLE"]).delete()
    StoreRole = apps.get_model("permissions", "StoreRole")
    StoreRole.objects.filter(code="STORE_QC").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("permissions", "0039_seed_phase1_1_permissions"),
        ("stores", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_qa_qc_roles, unseed_qa_qc_roles),
    ]
