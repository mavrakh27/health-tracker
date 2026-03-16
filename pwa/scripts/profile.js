// profile.js — Legacy stub (coach + goals moved to Today + Progress tabs)
// ProfileView is kept as a no-op for backwards compatibility

const ProfileView = {
  _tab: 'coach',
  async init() {
    // Coach chat and goals rendering moved to Today tab and Progress tab respectively
    // Settings cards are initialized directly by Settings.* methods in app.js
  },
  async renderGoals() {},
};
