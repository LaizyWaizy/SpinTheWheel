# Cinematic

Cinematic is a simple movie picker app built around a spin-the-wheel idea.

It helps pick what to watch by spinning for a genre and then spinning for a movie. You can add movie data, use example CSV files, filter by mood/rating, and make the decision feel a little less painful when the watchlist is too long.

## What It Does

- Spins a genre wheel
- Spins a movie wheel
- Shows movie info and posters when API keys are added
- Supports importing/exporting movie lists
- Includes example CSV files for diary, ratings, and watched data
- Has some AI-assisted mood matching

## Future Updates
- Might make it multi purpose for shows/anime
- Maybe screw around with manga/manhwa etc and link it with MAL or Anilist
- Make this public (HIGH MAYBE)

## Files

- `index.html` - the app page
- `styles.css` - the visuals
- `app.js` - main app logic
- `seed.js` - starter movie library
- `server.py` - tiny local server
- `*.example.csv` - sample CSV formats

## Credit

Most of the project was made by me, with AI helping on the JavaScript and the visual spin-the-wheel parts. The rest was me plus AI, LMAO. I suck at anything with java script. 

## Running It

You can run the local server in terminal/powershell/cmd with:

```bash
python server.py
```

Then open the local URL it prints in your browser.
