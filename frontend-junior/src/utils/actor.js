import { storage } from './storage'

export function getActor() {
  const user = storage.getUser()

  if (!user) {
    return {
      actor_name: 'System',
      actor_role: '',
    }
  }

  const name =
    user.profile?.full_name ||
    user.first_name ||
    user.username ||
    'System'

  const role =
    user.profile?.role_label ||
    user.profile?.role ||
    ''

  return {
    actor_name: name,
    actor_role: role,
  }
}