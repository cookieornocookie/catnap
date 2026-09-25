export class StoryViewer {
  constructor(socket) {
    this.socket = socket;
    this.currentStories = [];
    this.currentIndex = 0;
    this.timer = null;
    this.container = document.getElementById('story-viewer-modal');
  }

  startStoryGroup(stories) {
    if (!stories || stories.length === 0) return;
    
    this.currentStories = stories;
    this.currentIndex = 0;
    this.container.classList.add('active');
    
    this.showCurrentStory();
  }

  showCurrentStory() {
    clearTimeout(this.timer);
    
    const story = this.currentStories[this.currentIndex];
    if (!story) {
      this.closeViewer();
      return;
    }

    const imgEl = document.getElementById('story-media-image');
    const progressBar = document.getElementById('story-progress-bar-fill');
    
    imgEl.src = story.mediaUrl;
    
    // Reset and animate progress bar
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    
    setTimeout(() => {
      progressBar.style.transition = 'width 5000ms linear';
      progressBar.style.width = '100%';
    }, 50);

    // Auto-advance after 5 seconds
    this.timer = setTimeout(() => {
      this.nextStory();
    }, 5000);
  }

  nextStory() {
    this.currentIndex++;
    if (this.currentIndex < this.currentStories.length) {
      this.showCurrentStory();
    } else {
      this.closeViewer();
    }
  }

  previousStory() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.showCurrentStory();
    }
  }

  closeViewer() {
    clearTimeout(this.timer);
    this.container.classList.remove('active');
    this.currentStories = [];
    this.currentIndex = 0;
  }
}
