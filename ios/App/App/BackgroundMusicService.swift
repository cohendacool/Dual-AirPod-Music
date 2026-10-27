import LocalAuthentication

class BackgroundMusicService {
    static let shared = BackgroundMusicService()

    func startPlayingMusic() {
        print("Starting background music service")
    }

    func stopPlayingMusic() {
        print("Stopping background music service")
    }
}

@objc class BackgroundMusicServiceManager: NSObject, APNSBackgroundModeDelegate {
    static let shared = BackgroundMusicServiceManager()
    var backgroundMusicService: BackgroundMusicService?

    func didReceiveApplePushNotification(_ reward: APNSNotificationReward?) {
        guard let musicService = BackgroundMusicService.shared else {
            return
        }
        musicService.startPlayingMusic()
        print("Apple push notification received")
    }
}