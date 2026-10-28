import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()

demo_users = User.objects.filter(username__startswith='demo_').distinct()
user_ids = list(demo_users.values_list('id', flat=True))
print(f'Found {len(user_ids)} demo users:')
for u in demo_users:
    print(f'  - {u.username} ({u.email})')

if not user_ids:
    print('No demo users found.')
    exit(0)

with transaction.atomic():
    # Step 1: AuditLog (actor FK -> User PROTECT)
    try:
        from apps.audit.models import AuditLog
        c, _ = AuditLog.objects.filter(actor_id__in=user_ids).delete()
        print(f'Cleared AuditLog: {c}')
    except Exception as e:
        print(f'AuditLog error: {e}')

    # Step 2: StoreRoleAssignment -> StoreMembership -> User
    try:
        from apps.permissions.models import StoreRoleAssignment
        from apps.stores.models import StoreMembership
        sm_ids = list(StoreMembership.objects.filter(user_id__in=user_ids).values_list('id', flat=True))
        c, _ = StoreRoleAssignment.objects.filter(membership_id__in=sm_ids).delete()
        print(f'Cleared StoreRoleAssignment: {c}')
        c, _ = StoreMembership.objects.filter(user_id__in=user_ids).delete()
        print(f'Cleared StoreMembership: {c}')
    except Exception as e:
        print(f'StoreMembership error: {e}')

    # Step 3: MembershipRole -> CompanyMembership -> User
    try:
        from apps.companies.models import CompanyMembership
        from apps.permissions.models import MembershipRole
        cm_ids = list(CompanyMembership.objects.filter(user_id__in=user_ids).values_list('id', flat=True))
        c, _ = MembershipRole.objects.filter(membership_id__in=cm_ids).delete()
        print(f'Cleared MembershipRole: {c}')
        c, _ = CompanyMembership.objects.filter(user_id__in=user_ids).delete()
        print(f'Cleared CompanyMembership: {c}')
    except Exception as e:
        print(f'CompanyMembership error: {e}')

    # Step 4: Delete demo users
    count, _ = User.objects.filter(id__in=user_ids).delete()
    print(f'\nDeleted {count} demo user(s) successfully.')

