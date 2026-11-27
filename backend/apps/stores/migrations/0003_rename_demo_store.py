from django.db import migrations


def rename_demo_store(apps, schema_editor):
    SharedStore = apps.get_model("stores", "SharedStore")
    SharedStore.objects.filter(name__icontains="Demo").update(name="Central Warehouse")
    SharedStore.objects.filter(code="DEMOWH").update(code="MAINWH")


def unrename_demo_store(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("stores", "0002_storagelocation"),
    ]

    operations = [
        migrations.RunPython(rename_demo_store, unrename_demo_store),
    ]
