import { Alert } from 'react-native';
import { adsService } from '@/services/ads/AdsService';

export async function runDownloadWithRewardedPrompt(
  startDownload: () => void | Promise<void>,
): Promise<void> {
  await adsService.initialize();

  if (!adsService.canOfferDownloadRewardedPrompt()) {
    await startDownload();
    return;
  }

  await new Promise<void>((resolve) => {
    const proceed = () => {
      void Promise.resolve(startDownload()).finally(resolve);
    };

    Alert.alert(
      'Download',
      'Support StreamVault by watching a short ad.',
      [
        {
          text: 'Continue without Ad',
          style: 'cancel',
          onPress: proceed,
        },
        {
          text: 'Watch Ad & Download',
          onPress: () => {
            void adsService.tryShowRewardedAd().finally(proceed);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: proceed,
      },
    );
  });
}
