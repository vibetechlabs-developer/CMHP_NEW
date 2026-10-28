import {
  useEffect,
  useState,
} from 'react'

import {
  subscribeNotifications,
} from '../utils/notifications'

import './ToastContainer.css'

export default function ToastContainer() {

  const [
    notifications,
    setNotifications,
  ] = useState([])

  useEffect(() => {

    return subscribeNotifications(
      (notification) => {

        const id =
          `${Date.now()}-${Math.random()}`

        setNotifications(
          (current) => [
            ...current,
            {
              id,
              ...notification,
            },
          ]
        )

        window.setTimeout(
          () => {
            setNotifications(
              (current) =>
                current.filter(
                  (item) =>
                    item.id !== id
                )
            )
          },
          3500
        )
      }
    )

  }, [])

  return (
    <div className="cmhp-toast-container">

      {notifications.map(
        (notification) => (
          <div
            key={notification.id}
            className={`cmhp-toast cmhp-toast-${notification.type}`}
          >
            {notification.message}
          </div>
        )
      )}

    </div>
  )
}