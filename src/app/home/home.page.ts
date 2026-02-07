import { Component, OnDestroy, OnInit } from '@angular/core';
import { CameraPreview, CameraPreviewOptions, CameraPreviewPictureOptions } from '@capacitor-community/camera-preview';
import { Media } from '@capacitor-community/media';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { ToastController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  isCameraActive = false;

  constructor(
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) { }

  async ngOnInit() {
    // Permission checks are implicit for now
  }

  async ionViewDidEnter() {
    setTimeout(async () => {
      await this.startCamera();
    }, 500); // Small delay to ensure DOM is ready
  }

  async ionViewWillLeave() {
    await this.stopCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async startCamera() {
    if (this.isCameraActive) return;

    // Calculate 4:3 aspect ratio
    const screenWidth = Math.round(window.screen.width);
    const targetHeight = Math.round(screenWidth * (4 / 3));
    // Center it vertically if possible, or just place it top
    const y = Math.round((window.screen.height - targetHeight) / 2);

    const cameraPreviewOptions: CameraPreviewOptions = {
      position: 'rear',
      parent: 'cameraPreview',
      className: 'cameraPreview',
      toBack: true,
      x: 0,
      y: Math.max(0, y),
      width: screenWidth,
      height: targetHeight,
      storeToFile: false,
      disableAudio: true
    };

    try {
      // Only stop if we think it's active, but better yet, just try to start.
      // If start fails because it's already running, we catch it.
      // If we try to stop when it's not running, we get an error.

      await CameraPreview.start(cameraPreviewOptions);
      this.isCameraActive = true;
    } catch (err: any) {
      console.error('Error starting camera', err);
      // specific check for permission message if available
      const msg = err.message || JSON.stringify(err);
      this.showToast(`Start failed: ${msg}`);
    }
  }

  async stopCamera() {
    try {
      await CameraPreview.stop();
      this.isCameraActive = false;
    } catch (e) {
      // Ignore
    }
  }

  async captureImage() {
    if (!this.isCameraActive) {
      await this.startCamera();
      return;
    }

    const pictureOptions: CameraPreviewPictureOptions = {
      quality: 100
    };

    const loading = await this.loadingCtrl.create({ message: 'Saving...' });
    await loading.present();

    try {
      const result = await CameraPreview.capture(pictureOptions);
      await this.saveToGallery(result.value);
      this.showToast('Photo saved!');
    } catch (err: any) {
      console.error('Error capturing image', err);
      this.showToast(`Capture failed: ${err.message || JSON.stringify(err)}`);
    } finally {
      loading.dismiss();
    }
  }

  async saveToGallery(base64Data: string) {
    try {
      const fileName = `raw-lens-${Date.now()}.jpg`;

      if (Capacitor.getPlatform() === 'web') {
        const link = document.createElement('a');
        link.href = 'data:image/jpeg;base64,' + base64Data;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // 1. Write to temp
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        const fileUri = (await Filesystem.getUri({ path: fileName, directory: Directory.Cache })).uri;

        // 2. Find or Create Album
        let albumId = '';
        try {
          const albums = await Media.getAlbums();
          const rawAlbum = albums.albums.find(a => a.name === 'Raw Lens');

          if (rawAlbum) {
            albumId = rawAlbum.identifier;
          } else {
            await Media.createAlbum({ name: 'Raw Lens' });
            // Re-fetch to get the new ID
            const updatedAlbums = await Media.getAlbums();
            const newAlbum = updatedAlbums.albums.find(a => a.name === 'Raw Lens');
            if (newAlbum) albumId = newAlbum.identifier;
          }
        } catch (err) {
          console.warn('Error managing albums', err);
          // Fallback: don't specify album (might go to default) or rely on error handling
        }

        // 3. Save
        const saveOptions: any = {
          path: fileUri,
          fileName: `raw-lens-${Date.now()}` // Android wants filename code-side often without ext? Docs said so.
          // But let's stick to simple first:
        };

        if (albumId) {
          saveOptions.albumIdentifier = albumId;
        }

        await Media.savePhoto(saveOptions);

        await Filesystem.deleteFile({
          path: fileName,
          directory: Directory.Cache
        });
      }
    } catch (e) {
      console.error('Failed to save', e);
      throw e;
    }
  }

  async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
}
