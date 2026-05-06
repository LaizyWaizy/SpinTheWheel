// API keys are stored per user by server.py, not in this browser file.
const CONFIG = {
    omdb_api_key: "",
    tmdb_api_key: "",
    ai_api_key: ""
};

let authState = {
    authenticated: false,
    username: "",
    keys: {},
    aiProvider: ""
};

async function apiFetch(path, options = {}) {
    const fetchOptions = {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    };

    const response = await fetch(path, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
        const message = data && data.error ? data.error : `Request failed: ${response.status}`;
        throw new Error(message);
    }

    return data;
}

async function refreshAuthState() {
    try {
        authState = await apiFetch('/api/auth/me');
    } catch (e) {
        authState = { authenticated: false, username: "", keys: {}, aiProvider: "" };
    }
    updateAuthUi();
    return authState;
}

function hasApiKey(type) {
    return Boolean(authState && authState.keys && authState.keys[type]);
}

function getApiKey(type) {
    return hasApiKey(type) ? 'server' : null;
}

let movieDatabase = {
    "Action": [
        "Die Hard", "Mad Max: Fury Road", "The Dark Knight", "John Wick", 
        "Gladiator", "The Matrix", "Terminator 2: Judgment Day", "Inception",
        "Mission: Impossible - Fallout", "Indiana Jones and the Raiders of the Lost Ark"
    ],
    "Comedy": [
        "Superbad", "Step Brothers", "Dumb and Dumber", "The Hangover", 
        "Anchorman", "Tropic Thunder", "Shaun of the Dead", "Hot Fuzz",
        "Monty Python and the Holy Grail", "Super Troopers"
    ],
    "Sci-Fi": [
        "Blade Runner 2049", "Interstellar", "Dune", "Alien", 
        "The Martian", "Arrival", "Ex Machina", "2001: A Space Odyssey",
        "The Fifth Element", "Edge of Tomorrow"
    ],
    "Horror": [
        "The Shining", "Get Out", "Hereditary", "A Quiet Place", 
        "It Follows", "The Babadook", "The Conjuring", "Scream",
        "The Thing", "Halloween"
    ],
    "Drama": [
        "The Shawshank Redemption", "Forrest Gump", "The Godfather", 
        "Schindler's List", "Fight Club", "Pulp Fiction", "Good Will Hunting",
        "Whiplash", "12 Angry Men", "Parasite"
    ],
    "Romance": [
        "The Notebook", "Pride & Prejudice", "La La Land", "Titanic",
        "Before Sunrise", "Eternal Sunshine of the Spotless Mind", "Casablanca", 
        "When Harry Met Sally", "Notting Hill", "About Time"
    ],
    "Thriller": [
        "Se7en", "Silence of the Lambs", "Prisoners", "Zodiac",
        "Shutter Island", "Gone Girl", "The Departed", "Memento",
        "No Country for Old Men", "Nightcrawler"
    ]
};

// Attempt to load previously saved custom database
const savedDb = localStorage.getItem('omdb_movie_db');
if (savedDb) {
    try {
        const parsed = JSON.parse(savedDb);
        if (Object.keys(parsed).length > 0) {
            movieDatabase = parsed;
        }
    } catch (e) {
        console.error("Could not parse saved DB", e);
    }
}

// Merge SEED_LIBRARY into movieDatabase if it exists (defined in seed.js)
// Only add seed movies that aren't already in the database (no overwrite)
if (typeof SEED_LIBRARY !== 'undefined') {
    for (const [genre, movies] of Object.entries(SEED_LIBRARY)) {
        if (!movieDatabase[genre]) movieDatabase[genre] = [];
        for (const seedMovie of movies) {
            const seedTitle = typeof seedMovie === 'object' ? seedMovie.title : seedMovie;
            if (!movieDatabase[genre].find(m => (typeof m === 'object' ? m.title : m) === seedTitle)) {
                movieDatabase[genre].push(seedMovie);
            }
        }
    }
    console.log(`[Seed] Library merged. Total genres: ${Object.keys(movieDatabase).length}`);
}

let genres = Object.keys(movieDatabase);
const masterGenres = ["Action", "Adventure", "Animation", "Biography", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "Film-Noir", "History", "Horror", "Music", "Musical", "Mystery", "Romance", "Sci-Fi", "Short", "Sport", "Thriller", "War", "Western"];
masterGenres.forEach(g => {
    if (!genres.includes(g)) genres.push(g);
});

// DOM Elements
const genreDisplay = document.getElementById('genre-display');
const movieDisplay = document.getElementById('movie-display');
const spinGenreBtn = document.getElementById('spin-genre-btn');
const spinMovieBtn = document.getElementById('spin-movie-btn');
const libraryCountEl = document.getElementById('library-count');
const deleteMovieBtn = document.getElementById('delete-movie-btn');

function updateLibraryCount() {
    const allUnique = new Set();
    Object.values(movieDatabase).forEach(pool => {
        pool.forEach(m => allUnique.add(typeof m === 'object' ? m.title : m));
    });
    if (libraryCountEl) libraryCountEl.textContent = `${allUnique.size} Movies`;
}
updateLibraryCount();

if (deleteMovieBtn) {
    deleteMovieBtn.addEventListener('click', () => {
        const titleToRemove = deleteMovieBtn.dataset.title;
        if (!titleToRemove) return;
        
        let removed = false;
        // Search and destroy from all genres
        for (const genre in movieDatabase) {
            const oldLength = movieDatabase[genre].length;
            movieDatabase[genre] = movieDatabase[genre].filter(m => {
                const t = typeof m === 'object' ? m.title : m;
                return t !== titleToRemove;
            });
            if (movieDatabase[genre].length < oldLength) removed = true;
        }

        if (removed) {
            localStorage.setItem('omdb_movie_db', JSON.stringify(movieDatabase));
            updateLibraryCount();
            autoHardcodeToSeed(); // Trigger silent backup
            
            // UI feedback
            deleteMovieBtn.textContent = "✅ Removed!";
            deleteMovieBtn.style.color = "#10b981";
            deleteMovieBtn.style.borderColor = "rgba(16, 185, 129, 0.3)";
            deleteMovieBtn.style.background = "rgba(16, 185, 129, 0.1)";
            
            setTimeout(() => {
                document.getElementById('movie-details').classList.add('hidden');
                document.getElementById('movie-card').classList.remove('has-details');
                movieDisplay.textContent = "Spin for a movie!";
                
                // Re-draw wheel without the deleted movie
                const activePool = movieDatabase[currentGenre] || [];
                drawWheel(movieWheelCanvas, activePool.length > 0 ? activePool : ["?"]);
            }, 1000);
        }
    });
}

// State tracking
let currentGenre = null;
let currentMovie = null;
// Only show genres that actually have movies loaded
function getPopulatedGenres() {
    return genres.filter(g => movieDatabase[g] && movieDatabase[g].length > 0);
}

let activeGenres = getPopulatedGenres();
let activeAIFilteredMovies = null;

const moodInput = document.getElementById('mood-text-input');
const moodSubmit = document.getElementById('mood-submit-btn');
const moodClear = document.getElementById('mood-clear-btn');
const moodFeedback = document.getElementById('mood-feedback');
const ratingFilterSelect = document.getElementById('rating-filter-select');

if (ratingFilterSelect) {
    ratingFilterSelect.value = localStorage.getItem('movie_rating_filter') || 'any';
    ratingFilterSelect.addEventListener('change', () => {
        localStorage.setItem('movie_rating_filter', ratingFilterSelect.value);
        if (currentGenre) {
            movieDisplay.textContent = "Re-roll for this rating...";
            document.getElementById('movie-details').classList.add('hidden');
            document.getElementById('movie-card').classList.remove('has-details');
        }
    });
}

const keywordToGenres = {
    "mind": ["Mystery", "Sci-Fi", "Thriller"],
    "crazy": ["Action", "Sci-Fi", "Thriller"],
    "twist": ["Mystery", "Thriller"],
    "sad": ["Drama", "Romance", "Biography"],
    "cry": ["Drama", "Romance"],
    "emotional": ["Drama", "Romance"],
    "action": ["Action", "Adventure", "Crime"],
    "fight": ["Action", "Crime"],
    "hype": ["Action", "Adventure", "Sci-Fi"],
    "weird": ["Horror", "Sci-Fi", "Mystery", "Fantasy"],
    "strange": ["Sci-Fi", "Mystery"],
    "wtf": ["Horror", "Mystery"],
    "laugh": ["Comedy", "Animation", "Family"],
    "funny": ["Comedy"],
    "comedy": ["Comedy"],
    "hilarious": ["Comedy"],
    "scary": ["Horror", "Thriller"],
    "fear": ["Horror"],
    "horror": ["Horror"],
    "light": ["Comedy", "Romance", "Family", "Animation"],
    "chill": ["Comedy", "Romance", "Drama"],
    "happy": ["Comedy", "Family", "Adventure", "Romance"],
    "feel good": ["Comedy", "Romance", "Family"],
    "romance": ["Romance", "Drama"],
    "romantic": ["Romance"],
    "love": ["Romance", "Drama"],
    "sexual": ["Romance", "Thriller", "Drama"],
    "sexy": ["Romance", "Thriller"],
    "date": ["Romance", "Comedy"],
    "dark": ["Horror", "Thriller", "Crime", "Mystery", "Drama"],
    "murder": ["Crime", "Thriller", "Mystery"],
    "kill": ["Crime", "Action", "Thriller"],
    "blood": ["Horror", "Crime", "Action"],
    "space": ["Sci-Fi", "Adventure"],
    "alien": ["Sci-Fi", "Horror"],
    "future": ["Sci-Fi"],
    "magic": ["Fantasy", "Animation"],
    "true story": ["Biography", "Drama"],
    "real life": ["Biography", "Drama"],
    "kids": ["Family", "Animation"]
};

function updateWheelsForMood() {
    currentGenre = null;
    currentMovie = null;
    genreDisplay.textContent = "?";
    movieDisplay.textContent = "Waiting for Genre...";
    document.getElementById('movie-details').classList.add('hidden');
    document.getElementById('movie-card').classList.remove('has-details');
    
    drawWheel(genreWheelCanvas, activeGenres);
    drawWheel(movieWheelCanvas, ["?"]);
    
    spinGenreBtn.disabled = false;
    spinMovieBtn.disabled = true;
}

function basicKeywordParse(text) {
    let matchedGenres = new Set();
    const lowerText = text.toLowerCase();
    
    for (const [keyword, gList] of Object.entries(keywordToGenres)) {
        if (lowerText.includes(keyword)) {
            gList.forEach(g => {
                if (genres.includes(g)) matchedGenres.add(g);
            });
        }
    }
    
    if (matchedGenres.size > 0) {
        activeGenres = Array.from(matchedGenres).filter(g => movieDatabase[g] && movieDatabase[g].length > 0);
        if (activeGenres.length === 0) activeGenres = getPopulatedGenres();
        moodFeedback.textContent = `Interpreted as: ${activeGenres.join(', ')} (Basic Mode)`;
        moodFeedback.style.color = "var(--accent-1)";
    } else {
        activeGenres = getPopulatedGenres();
        moodFeedback.textContent = "Couldn't pinpoint exactly. Dropping everything in!";
        moodFeedback.style.color = "var(--text-secondary)";
    }
    updateWheelsForMood();
}

async function parseMoodText() {
    const text = moodInput.value.trim();
    if (!text) {
        resetMood();
        return;
    }
    
    moodFeedback.textContent = "AI is thinking...";
    moodFeedback.style.color = "var(--text-secondary)";
    moodInput.disabled = true;
    moodSubmit.disabled = true;
    
    try {
        let reply = "";
        const aiKey = getApiKey('ai');
        
        if (aiKey && authState.aiProvider === 'gemini') {
            // Build full library string to send to Gemini
            const allMoviesSet = new Set();
            for (const pool of Object.values(movieDatabase)) {
                pool.forEach(m => allMoviesSet.add(typeof m === 'object' ? m.title : m));
            }
            const allMoviesList = Array.from(allMoviesSet).join(', ');

            // Google Gemini Logic
            const modelList = await apiFetch('/api/ai/gemini/models', { method: 'POST' });
            const targetModel = modelList.models.find(m => m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent')).name;
            const data = await apiFetch('/api/ai/gemini/generate', {
                method: 'POST',
                body: JSON.stringify({
                    model: targetModel,
                    system_instruction: {
                        parts: { text: `You are an expert movie recommendation engine that understands human emotions, tone, pacing, and intent.
Here is the user's local movie library:
${allMoviesList}

Your job is to analyze the user's input and output:
1. 'genres': Array of 2-3 accurate broad genres from the allowed list: ${genres.join(', ')}.
2. 'tags': Array of 5-10 highly specific descriptive keywords/tropes (e.g., spy, political, conspiracy, toxic).
3. 'movies': Array of 30-50 exact movie titles from the provided library list above that match ANY of your generated tags or the general vibe. Do NOT hallucinate movies not in the library. This list will populate the final wheel.` }
                    },
                    contents: [{
                        parts: [{ text: `User mood: "${text}"` }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                genres: { type: "ARRAY", items: { type: "STRING" } },
                                tags: { type: "ARRAY", items: { type: "STRING" } },
                                movies: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: ["genres", "tags", "movies"]
                        }
                    }
                })
            });
            if (data.error) throw new Error(data.error.message);
            const raw = data.candidates[0].content.parts[0].text;
            const parsed = JSON.parse(raw);
            reply = parsed.genres.join(', ');
            
            if (parsed.movies && parsed.movies.length > 0) {
                // Store AI's perfectly tagged movies
                activeAIFilteredMovies = parsed.movies.map(m => m.toLowerCase());
                console.log("AI Tags Used:", parsed.tags);
                console.log("AI Passed Movies:", activeAIFilteredMovies);
            } else {
                activeAIFilteredMovies = null;
            }
        } else if (aiKey && authState.aiProvider === 'openai') {
            // OpenAI Logic 
            const data = await apiFetch('/api/ai/openai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {role: "system", content: `You are an expert movie recommendation engine that understands human emotions.
The ONLY exact genres you can pick from are: ${genres.join(', ')}. Restrict your output to these.
Interpret the user's emotional state, themes, complexity, energy, and tone.
RULES: Return 3-5 genres max. Prioritize the best match. Map relationships to Drama/Romance; mindfuck to Thriller; weird to Sci-Fi/Horror; high-energy to Action. Return ONLY a comma-separated list of genres (no explanation, no markdown).`},
                        {role: "user", content: `User mood: "${text}"`}
                    ],
                    temperature: 0.2,
                    max_tokens: 30
                })
            });
            if (data.error) throw new Error(data.error.message);
            reply = data.choices[0].message.content;
        } else {
            // No API Key? Let's use Pollinations.ai completely Free public LLM!
            console.log("Attempting free AI routing via Pollinations...");
            const prompt = `You are a strict categorization engine. The user's mood is: "${text}". The ONLY available exact genres are: ${genres.join(', ')}. Return ONLY a comma-separated list of the best matching genres from that exact list. Do NOT write full sentences. Do NOT return emojis. ONLY return known genres.`;
            const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
            if (!response.ok) throw new Error("Free AI network limit reached");
            reply = await response.text();
            console.log("Pollinations response:", reply);
        }
        
        // Scan the entire LLM reply for mention of valid genres using regex word boundaries
        // This is bulletproof even if the AI writes conversational text like "Here are your genres: Action, Drama"
        let matchedGenres = new Set();
        genres.forEach(g => {
            const regex = new RegExp(`\\b${g}\\b`, 'i');
            if (regex.test(reply)) matchedGenres.add(g);
        });
        
        if (matchedGenres.size > 0) {
            activeGenres = Array.from(matchedGenres).filter(g => movieDatabase[g] && movieDatabase[g].length > 0);
            if (activeGenres.length === 0) activeGenres = getPopulatedGenres(); // fallback if filter stripped everything
            
            moodFeedback.textContent = `AI Interpreted: ${activeGenres.join(', ')}`;
            moodFeedback.style.color = "var(--accent-1)";
        } else {
            throw new Error("No direct genres mapped: " + reply);
        }
        updateWheelsForMood();
    } catch (e) {
        console.warn("AI Model failed or was uncertain, falling back to local heuristic...", e);
        basicKeywordParse(text);
    } finally {
        moodInput.disabled = false;
        moodSubmit.disabled = false;
        moodInput.focus();
    }
}

function resetMood() {
    moodInput.value = "";
    activeGenres = getPopulatedGenres();
    activeAIFilteredMovies = null;
    moodFeedback.textContent = "";
    updateWheelsForMood();
}

moodSubmit.addEventListener('click', parseMoodText);
moodInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') parseMoodText();
});
moodClear.addEventListener('click', resetMood);

function getText(item) {
    return typeof item === 'object' && item !== null ? item.title : item;
}

// Wheel Visualizers
const genreWheelCanvas = document.getElementById('genre-wheel-canvas');
const movieWheelCanvas = document.getElementById('movie-wheel-canvas');
let genreRotation = 0;
let movieRotation = 0;

// Audio Context for Ticking
let audioCtx;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTick() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function getMatrixRotation(matrix) {
    if (matrix === 'none') return 0;
    const values = matrix.split('(')[1].split(')')[0].split(',');
    const a = parseFloat(values[0]);
    const b = parseFloat(values[1]);
    let angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
    return (angle < 0 ? angle + 360 : angle);
}

function drawWheel(canvas, items) {
    if(!canvas || items.length === 0) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const radius = width / 2;
    
    ctx.clearRect(0,0,width,height);
    
    const sliceAngle = (2 * Math.PI) / items.length;
    const wheelColors = ["#f43f5e", "#ec4899", "#d946ef", "#a855f7", "#8b5cf6", "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b", "#f97316"];
    
    for (let i = 0; i < items.length; i++) {
        let colorIndex = i % wheelColors.length;
        if (i === items.length - 1 && items.length % wheelColors.length === 1 && items.length > 1) {
            colorIndex = 1;
        }
        
        ctx.fillStyle = wheelColors[colorIndex]; 
        ctx.beginPath();
        if (items.length === 1) {
            ctx.arc(radius, radius, radius, 0, 2 * Math.PI);
        } else {
            ctx.moveTo(radius, radius);
            ctx.arc(radius, radius, radius, i * sliceAngle, (i + 1) * sliceAngle);
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.save();
        ctx.translate(radius, radius);
        ctx.rotate((i * sliceAngle) + (sliceAngle / 2));
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 16px Outfit, sans-serif";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 4;
        
        let text = getText(items[i]);
        if (text.length > 20) text = text.substring(0, 17) + "..."; 
        
        ctx.fillText(text, radius - 20, 6); 
        ctx.restore();
    }
}

function spinVisualWheel(canvas, pointerSelector, startRotation, items, winningItem, durationMs) {
    if (!canvas || items.length === 0) return startRotation;
    
    const winningItemIndex = items.findIndex(item => getText(item) === getText(winningItem));
    const sliceAngle = 360 / items.length;
    const sliceCenterAngle = (winningItemIndex * sliceAngle) + (sliceAngle / 2);
    // Slight random offset inside the winning slice
    const sliceVariance = (Math.random() - 0.5) * (sliceAngle * 0.7); 
    
    const targetOffset = 360 - sliceCenterAngle + sliceVariance;
    const extraSpins = 360 * 5; 
    
    const nextTarget = Math.ceil(startRotation / 360) * 360 + extraSpins + targetOffset;
    const newRotation = nextTarget;
    
    canvas.style.transition = `transform ${durationMs}ms cubic-bezier(0.15, 0.85, 0.15, 1)`;
    canvas.style.transform = `rotate(${newRotation}deg)`;

    // Start tick tracker
    const pointer = document.querySelector(pointerSelector);
    const startStr = getComputedStyle(canvas).transform;
    let lastAngle = getMatrixRotation(startStr);
    let accumulated = 0;
    
    const actualPegs = Math.max(items.length, 24);
    const actualPegAngle = 360 / actualPegs;
    const timeStart = Date.now();
    
    function checkTick() {
        if (Date.now() - timeStart > durationMs) return; // done spinning
        
        let matrix = getComputedStyle(canvas).transform;
        let currentAngle = getMatrixRotation(matrix);
        let delta = currentAngle - lastAngle;
        
        // Handle wraparound
        if (delta < -180) delta += 360; 
        else if (delta > 180) delta -= 360;
        
        accumulated += Math.abs(delta);
        lastAngle = currentAngle;
        
        if (accumulated >= actualPegAngle) {
            playTick();
            accumulated = accumulated % actualPegAngle;
            
            // Pointer bounce animation
            if (pointer) {
                pointer.style.transform = 'translateY(-50%) rotate(25deg)';
                setTimeout(() => {
                    pointer.style.transform = 'translateY(-50%) rotate(0deg)';
                }, 40);
            }
        }
        requestAnimationFrame(checkTick);
    }
    requestAnimationFrame(checkTick);
    return newRotation;
}

// Initial draw
drawWheel(genreWheelCanvas, genres);
drawWheel(movieWheelCanvas, ["?"]);

// Helpers
function cleanTitle(title) {
    return title
        .replace(/\(\d{4}\)/g, "") // remove year
        .replace(/\s+/g, " ")      // normalize spaces
        .trim();
}

function getRandomItem(array) {
    // Pure unstructured Math.random(), no weights
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

function getRandomItemExcludingTitle(array, excludedTitle) {
    if (!excludedTitle || array.length <= 1) return getRandomItem(array);

    const normalizedExcluded = normalizeMovieTitleForMatch(excludedTitle);
    const availableItems = array.filter(item =>
        normalizeMovieTitleForMatch(getText(item)) !== normalizedExcluded
    );

    return getRandomItem(availableItems.length > 0 ? availableItems : array);
}

function getSelectedRatingFilter() {
    return ratingFilterSelect ? ratingFilterSelect.value : 'any';
}

function getRatingFilterLabel(filter = getSelectedRatingFilter()) {
    if (filter === 'any') return 'Any rating';
    if (filter === 'under6') return 'Under 6.0';
    return `${filter}.0+`;
}

function parseMovieRating(movie) {
    if (typeof movie !== 'object' || movie === null) return null;
    const rating = parseFloat(movie.rating);
    return Number.isFinite(rating) ? rating : null;
}

function ratingMatches(movie, filter = getSelectedRatingFilter()) {
    if (filter === 'any') return true;
    const rating = parseMovieRating(movie);
    if (rating === null) return false;
    if (filter === 'under6') return rating < 6;
    return rating >= Number(filter);
}

function updateMovieEverywhere(title, details) {
    const normalizedTitle = title.toLowerCase();
    let changed = false;

    for (const genre in movieDatabase) {
        movieDatabase[genre] = movieDatabase[genre].map(movie => {
            const movieTitle = typeof movie === 'object' ? movie.title : movie;
            if (movieTitle.toLowerCase() !== normalizedTitle) return movie;
            changed = true;
            return {
                ...(typeof movie === 'object' ? movie : {}),
                ...details
            };
        });
    }

    if (changed) {
        localStorage.setItem('omdb_movie_db', JSON.stringify(movieDatabase));
    }
}

function getUniqueMovies() {
    const moviesByTitle = new Map();

    Object.values(movieDatabase).forEach(pool => {
        pool.forEach(movie => {
            const title = getText(movie);
            const normalizedTitle = title.toLowerCase();
            const existing = moviesByTitle.get(normalizedTitle);
            if (!existing || (parseMovieRating(existing) === null && parseMovieRating(movie) !== null)) {
                moviesByTitle.set(normalizedTitle, movie);
            }
        });
    });

    return Array.from(moviesByTitle.values()).sort((a, b) => getText(a).localeCompare(getText(b)));
}

function getMoviesMissingRatings() {
    return getUniqueMovies().filter(movie => parseMovieRating(movie) === null);
}

function csvEscape(value) {
    const stringValue = value === undefined || value === null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
}

function getExportRows() {
    const moviesByTitle = new Map();

    Object.entries(movieDatabase).forEach(([genre, pool]) => {
        pool.forEach(movie => {
            const title = getText(movie);
            const normalizedTitle = title.toLowerCase();
            const existing = moviesByTitle.get(normalizedTitle) || {
                movie,
                genres: new Set()
            };

            existing.genres.add(genre);
            if (parseMovieRating(existing.movie) === null && parseMovieRating(movie) !== null) {
                existing.movie = movie;
            }
            moviesByTitle.set(normalizedTitle, existing);
        });
    });

    return Array.from(moviesByTitle.values())
        .map(({ movie, genres }) => ({
            title: getText(movie),
            genres: Array.from(genres).sort().join('; '),
            rating: typeof movie === 'object' && movie !== null ? movie.rating || '' : '',
            ratingSource: typeof movie === 'object' && movie !== null ? movie.ratingSource || '' : '',
            tmdbId: typeof movie === 'object' && movie !== null ? movie.tmdbId || '' : '',
            poster: typeof movie === 'object' && movie !== null ? movie.poster || '' : ''
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
}

function downloadMovieExport() {
    const rows = getExportRows();
    if (rows.length === 0) return;

    const header = ['Title', 'Genres', 'Rating', 'Rating Source', 'TMDb ID', 'Poster'];
    const csvLines = [
        header.map(csvEscape).join(','),
        ...rows.map(row => [
            row.title,
            row.genres,
            row.rating,
            row.ratingSource,
            row.tmdbId,
            row.poster
        ].map(csvEscape).join(','))
    ];

    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cinematic-movies-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function getCsvValue(row, headerMap, possibleHeaders) {
    for (const header of possibleHeaders) {
        const index = headerMap.get(header.toLowerCase());
        if (index !== undefined) return (row[index] || '').trim();
    }
    return '';
}

function parseMovieExportCsv(csvText) {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) return [];

    const headerMap = new Map();
    rows[0].forEach((header, index) => headerMap.set(header.trim().toLowerCase(), index));

    return rows.slice(1).map(row => {
        const title = getCsvValue(row, headerMap, ['title', 'name']);
        if (!title) return null;

        const genreText = getCsvValue(row, headerMap, ['genres', 'genre']);
        const genresForMovie = genreText
            .split(/[;,]/)
            .map(genre => genre.trim())
            .filter(Boolean);

        return {
            title,
            genres: genresForMovie.length > 0 ? genresForMovie : ['Uncategorized'],
            rating: getCsvValue(row, headerMap, ['rating']),
            ratingSource: getCsvValue(row, headerMap, ['rating source', 'ratingsource']),
            tmdbId: getCsvValue(row, headerMap, ['tmdb id', 'tmdbid']),
            poster: getCsvValue(row, headerMap, ['poster']),
            seasons: getCsvValue(row, headerMap, ['seasons', 'season'])
        };
    }).filter(Boolean);
}

function mergeCsvMoviesIntoLibrary(csvMovies) {
    let addedCount = 0;
    let updatedCount = 0;

    csvMovies.forEach(csvMovie => {
        const movieObj = {
            title: csvMovie.title,
            poster: csvMovie.poster,
            rating: csvMovie.rating,
            ratingSource: csvMovie.ratingSource,
            tmdbId: csvMovie.tmdbId
        };

        Object.keys(movieObj).forEach(key => {
            if (movieObj[key] === '') delete movieObj[key];
        });

        csvMovie.genres.forEach(genre => {
            if (!movieDatabase[genre]) movieDatabase[genre] = [];

            const normalizedTitle = normalizeMovieTitleForMatch(csvMovie.title);
            const existingIndex = movieDatabase[genre].findIndex(movie =>
                normalizeMovieTitleForMatch(getText(movie)) === normalizedTitle
            );

            if (existingIndex === -1) {
                movieDatabase[genre].push(movieObj);
                addedCount++;
                return;
            }

            const existingMovie = movieDatabase[genre][existingIndex];
            if (typeof existingMovie === 'object' && existingMovie !== null) {
                movieDatabase[genre][existingIndex] = {
                    ...existingMovie,
                    ...movieObj
                };
            } else {
                movieDatabase[genre][existingIndex] = movieObj;
            }
            updatedCount++;
        });
    });

    return { addedCount, updatedCount };
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function isOmdbLimitError(message) {
    return Boolean(message && message.toLowerCase().includes('request limit'));
}

async function tmdbFetch(path, params = {}) {
    if (!hasApiKey('tmdb')) return null;

    const url = new URL(`/api/tmdb${path}`, window.location.origin);
    Object.entries(params).forEach(([param, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(param, value);
        }
    });

    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`TMDb request failed: ${res.status}`);
    return res.json();
}

async function getTmdbGenreMap() {
    const data = await tmdbFetch('/genre/movie/list');
    const map = new Map();
    if (data && Array.isArray(data.genres)) {
        data.genres.forEach(genre => map.set(genre.id, genre.name));
    }
    return map;
}

async function fetchTmdbMovie(title, genreMap) {
    const data = await tmdbFetch('/search/movie', {
        query: title,
        include_adult: 'false',
        language: 'en-US',
        page: 1
    });

    const result = data && Array.isArray(data.results) ? data.results[0] : null;
    if (!result) return null;

    const genreNames = (result.genre_ids || [])
        .map(id => genreMap.get(id))
        .filter(Boolean);

    return {
        movie: {
            title: result.title || title,
            poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : 'N/A',
            rating: Number.isFinite(result.vote_average) ? result.vote_average.toFixed(1) : 'N/A',
            ratingSource: 'TMDb',
            tmdbId: result.id
        },
        genres: genreNames.length > 0 ? genreNames : ['Uncategorized']
    };
}

async function fetchMovieDetails(title) {
    if (hasApiKey('tmdb')) {
        try {
            const genreMap = await getTmdbGenreMap();
            const tmdbMovie = await fetchTmdbMovie(title, genreMap);
            if (tmdbMovie) {
                updateMovieEverywhere(title, tmdbMovie.movie);
                return tmdbMovie.movie;
            }
        } catch (e) {
            console.error("TMDb details fetch failed", e);
        }
    }

    if (!hasApiKey('omdb')) return null;

    try {
        const res = await fetch(`/api/omdb?t=${encodeURIComponent(title)}`, { credentials: 'same-origin' });
        const data = await res.json();
        if (data.Response !== "True") {
            if (isOmdbLimitError(data.Error)) {
                return { limited: true, error: data.Error };
            }
            return null;
        }

        const details = {
            title: data.Title,
            poster: data.Poster,
            rating: data.imdbRating,
            ratingSource: 'IMDb'
        };

        updateMovieEverywhere(title, details);
        return details;
    } catch (e) {
        console.error("Movie details fetch failed", e);
        return null;
    }
}

async function getRatingFilteredPool(pool) {
    const filter = getSelectedRatingFilter();
    if (filter === 'any') return pool;

    const filtered = [];
    const checkedTitles = new Set();

    for (const movie of pool) {
        const title = getText(movie);
        const normalizedTitle = title.toLowerCase();
        if (checkedTitles.has(normalizedTitle)) continue;
        checkedTitles.add(normalizedTitle);

        if (ratingMatches(movie, filter)) {
            filtered.push(movie);
        }
    }

    return filtered;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Spin Animation Effect
async function spinEffect(element, items, finalItem, duration = 1000) {
    element.classList.remove('animate-pop');
    element.classList.add('is-spinning');
    
    const startTime = Date.now();
    let lastItem = "";
    
    // Quick random visually changing until duration ends
    while (Date.now() - startTime < duration) {
        let randomSpinItem;
        do {
            randomSpinItem = getRandomItem(items);
        } while (randomSpinItem === lastItem && items.length > 1);
        
        lastItem = randomSpinItem;
        element.textContent = getText(randomSpinItem);
        await sleep(60); 
    }
    
    element.classList.remove('is-spinning');
    element.textContent = getText(finalItem);
    
    // Force DOM reflow to trigger CSS pop animation
    void element.offsetWidth;
    element.classList.add('animate-pop');
}

// Event// Core selection logic for Movie
async function calculateAndSpinMovie(genre, spinDur) {
    // 1. Establish Base Pool
    const basePool = movieDatabase[genre] || [];
    const filteredBasePool = await getRatingFilteredPool(basePool);

    if (filteredBasePool.length === 0) {
        currentMovie = null;
        const ratingLabel = getRatingFilterLabel();
        movieDisplay.textContent = `No ${ratingLabel} movies here`;
        drawWheel(movieWheelCanvas, ["No match"]);
        document.getElementById('movie-details').classList.add('hidden');
        document.getElementById('movie-card').classList.remove('has-details');
        return;
    }
    
    // 2. Score and Filter
    const aiMatchPool = [];
    const tiers = { 3: [], 2: [], 1: [] };
    const seenTitles = new Set();
    
    filteredBasePool.forEach(m => {
        const title = typeof m === 'object' ? m.title : m;
        if (seenTitles.has(title)) return;
        seenTitles.add(title);
        
        if (activeAIFilteredMovies && activeAIFilteredMovies.includes(title.toLowerCase())) {
            aiMatchPool.push(m);
        }
        
        let score = 0;
        activeGenres.forEach(g => {
            if (movieDatabase[g] && movieDatabase[g].find(e => (typeof e === 'object' ? e.title : e) === title)) {
                score++;
            }
        });
        
        if (score >= 3) tiers[3].push(m);
        else if (score === 2) tiers[2].push(m);
        else tiers[1].push(m);
    });

    let finalPool = [];
    if (aiMatchPool.length > 0) finalPool = aiMatchPool;
    else if (tiers[3].length > 0) finalPool = tiers[3];
    else if (tiers[2].length > 0) finalPool = tiers[2];
    else if (tiers[1].length > 0) finalPool = tiers[1];

    if (finalPool.length === 0) finalPool = filteredBasePool;

    const previousMovieTitle = currentMovie ? getText(currentMovie) : null;
    currentMovie = getRandomItemExcludingTitle(finalPool, previousMovieTitle);
    const renderPool = finalPool.slice(0, 50); 
    if (!currentMovie) currentMovie = finalPool[0];
    const displayPool = renderPool.length > 0 ? renderPool : (currentMovie ? [currentMovie] : ["?"]);
    
    if (deleteMovieBtn && currentMovie) {
        deleteMovieBtn.dataset.title = typeof currentMovie === 'object' ? currentMovie.title : currentMovie;
        deleteMovieBtn.textContent = "❌ Mark as Watched";
        deleteMovieBtn.style.color = "";
        deleteMovieBtn.style.borderColor = "";
        deleteMovieBtn.style.background = "";
    }
    
    drawWheel(movieWheelCanvas, displayPool); 
    movieRotation = spinVisualWheel(movieWheelCanvas, '.movie-pointer', movieRotation, displayPool, currentMovie || "?", spinDur);
    await spinEffect(movieDisplay, displayPool, currentMovie || "?", spinDur);
    
    if (!currentMovie) {
        movieDisplay.textContent = "No movies in this genre!";
        return;
    }

    let movieToDisplay = currentMovie;
    
    // Live self-healing
    if (typeof movieToDisplay === 'string') {
        movieToDisplay = await fetchMovieDetails(movieToDisplay) || movieToDisplay;
    }
    
    if (typeof movieToDisplay === 'object' && movieToDisplay !== null) {
        const details = document.getElementById('movie-details');
        const poster = document.getElementById('movie-poster');
        const rating = document.getElementById('movie-rating-val');
        const ratingSource = document.getElementById('movie-rating-source');
        
        if (movieToDisplay.poster && movieToDisplay.poster !== "N/A") {
            poster.src = movieToDisplay.poster;
            poster.style.display = 'block';
        } else {
            poster.style.display = 'none';
        }
        
        rating.textContent = movieToDisplay.rating || "??";
        if (ratingSource) ratingSource.textContent = movieToDisplay.ratingSource || "Rating";
        details.classList.remove('hidden');
        document.getElementById('movie-card').classList.add('has-details');
    }
}

// Events
spinGenreBtn.addEventListener('click', async () => {
    initAudio();
    spinGenreBtn.disabled = true;
    spinMovieBtn.disabled = true;
    
    document.getElementById('movie-details').classList.add('hidden');
    document.getElementById('movie-card').classList.remove('has-details');
    
    drawWheel(genreWheelCanvas, activeGenres); 
    currentGenre = getRandomItem(activeGenres);
    
    const spinDur = 2500;
    genreRotation = spinVisualWheel(genreWheelCanvas, '.genre-pointer', genreRotation, activeGenres, currentGenre, spinDur);
    
    const genreProm = spinEffect(genreDisplay, activeGenres, currentGenre, spinDur);
    const movieProm = calculateAndSpinMovie(currentGenre, spinDur + 500); // Wait 500ms longer for climax
    
    await Promise.all([genreProm, movieProm]);
    
    spinGenreBtn.disabled = false;
    spinMovieBtn.disabled = false;
    spinGenreBtn.textContent = "Spin Both Wheels";
});

spinMovieBtn.addEventListener('click', async () => {
    if (!currentGenre) return;
    initAudio();
    spinGenreBtn.disabled = true;
    spinMovieBtn.disabled = true;
    
    document.getElementById('movie-details').classList.add('hidden');
    document.getElementById('movie-card').classList.remove('has-details');
    
    await calculateAndSpinMovie(currentGenre, 2500);
    
    spinGenreBtn.disabled = false;
    spinMovieBtn.disabled = false;
});

// Import Logic Nodes
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importModal = document.getElementById('import-modal');
const closeModal = document.getElementById('close-modal');
const processBtn = document.getElementById('process-import-btn');
const movieCsvFileInput = document.getElementById('movie-csv-file');
const processCsvImportBtn = document.getElementById('process-csv-import-btn');
const apiKeyInput = document.getElementById('api-key');
const tmdbKeyInput = document.getElementById('tmdb-key');
const aiKeyInput = document.getElementById('ai-key');
const movieListInput = document.getElementById('movie-list');
const importStatus = document.getElementById('import-status');

// Letterboxd Modal Nodes
const letterboxdBtn = document.getElementById('letterboxd-btn');
const letterboxdModal = document.getElementById('letterboxd-modal');
const closeLetterboxd = document.getElementById('close-letterboxd');
const processLetterboxdBtn = document.getElementById('process-letterboxd-btn');
const letterboxdStatus = document.getElementById('letterboxd-status');

// Calibration Modal Nodes
const calibrateBtn = document.getElementById('calibrate-btn');
const calibrationModal = document.getElementById('calibration-modal');
const closeCalibration = document.getElementById('close-calibration');
const startCalibrationBtn = document.getElementById('start-calibration-btn');
const calibrationStatus = document.getElementById('calibration-status');
const calibrationCount = document.getElementById('calibration-count');
const calibrationPercent = document.getElementById('calibration-percent');
const calibrationProgressBar = document.getElementById('calibration-progress-bar');
const showCalibrationModal = document.getElementById('show-calibration-modal');
const closeShowCalibration = document.getElementById('close-show-calibration');
const startShowCalibrationBtn = document.getElementById('start-show-calibration-btn');
const showCalibrationStatus = document.getElementById('show-calibration-status');
const showCalibrationCount = document.getElementById('show-calibration-count');
const showCalibrationPercent = document.getElementById('show-calibration-percent');
const showCalibrationProgressBar = document.getElementById('show-calibration-progress-bar');

// Account settings nodes
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsStatus = document.getElementById('settings-status');
const settingsUserNote = document.getElementById('settings-user-note');
const accountCalibrateMoviesBtn = document.getElementById('account-calibrate-movies-btn');
const accountCalibrateShowsBtn = document.getElementById('account-calibrate-shows-btn');

// Auth Modal Nodes
const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
const closeAuth = document.getElementById('close-auth');
const authTitle = document.getElementById('auth-title');
const authCopy = document.getElementById('auth-copy');
const authForm = document.getElementById('auth-form');
const authAccountPanel = document.getElementById('auth-account-panel');
const authAccountName = document.getElementById('auth-account-name');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const authStatus = document.getElementById('auth-status');

// Search Modal Nodes
const searchBtn = document.getElementById('search-btn');
const searchModal = document.getElementById('search-modal');
const closeSearchModal = document.getElementById('close-search-modal');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// Movie Info Modal Nodes
const movieInfoModal = document.getElementById('movie-info-modal');
const closeMovieInfo = document.getElementById('close-movie-info');
const infoPoster = document.getElementById('info-poster');
const infoTitle = document.getElementById('info-title');
const infoMeta = document.getElementById('info-meta');
const infoPlot = document.getElementById('info-plot');
const infoDirector = document.getElementById('info-director');
const infoActors = document.getElementById('info-actors');

function updateAuthUi() {
    const isLoggedIn = Boolean(authState.authenticated);

    if (authBtn) {
        authBtn.textContent = isLoggedIn ? "Account" : "Login";
        authBtn.title = isLoggedIn ? `Logged in as ${authState.username}` : "Login";
    }

    if (settingsUserNote) {
        settingsUserNote.textContent = isLoggedIn
            ? `Logged in as ${authState.username}. Keys are saved on this local server and only shown here as masked values.`
            : "Login to save API keys to your private local server account.";
    }

    if (authTitle) authTitle.textContent = isLoggedIn ? "Account" : "Login";
    if (authCopy) {
        authCopy.textContent = isLoggedIn
            ? "You are already logged in. Your API keys are attached to this local account."
            : "Your API keys stay in a private local account on this server, not in browser localStorage.";
    }
    if (authForm) authForm.classList.toggle('hidden', isLoggedIn);
    if (authAccountPanel) authAccountPanel.classList.toggle('hidden', !isLoggedIn);
    if (authAccountName) authAccountName.textContent = isLoggedIn ? `Logged in as ${authState.username}` : "";
    if (saveSettingsBtn) saveSettingsBtn.disabled = !isLoggedIn;
}

async function runAuthAction(mode) {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password) {
        authStatus.textContent = "Enter a username and password.";
        authStatus.style.color = "#ec4899";
        return;
    }

    authStatus.textContent = mode === 'login' ? "Logging in..." : "Creating account...";
    authStatus.style.color = "var(--accent-1)";
    loginBtn.disabled = true;
    registerBtn.disabled = true;

    try {
        await apiFetch(`/api/auth/${mode}`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        authPassword.value = "";
        await refreshAuthState();
        authStatus.textContent = mode === 'login' ? "Logged in." : "Account created.";
        authStatus.style.color = "#10b981";
        setTimeout(() => authModal.classList.add('hidden'), 700);
    } catch (e) {
        authStatus.textContent = e.message;
        authStatus.style.color = "#ec4899";
    } finally {
        loginBtn.disabled = false;
        registerBtn.disabled = false;
    }
}

async function refreshAccountSettingsStatus() {
    if (!authState.authenticated || !settingsStatus) return;

    tmdbKeyInput.value = "";
    apiKeyInput.value = "";
    aiKeyInput.value = "";
    settingsStatus.textContent = "Loading saved API key status...";
    settingsStatus.style.color = "var(--accent-1)";

    try {
        const settings = await apiFetch('/api/settings');
        const parts = [];
        if (settings.keys.tmdb) parts.push(`TMDb ${settings.keys.tmdb}`);
        if (settings.keys.omdb) parts.push(`OMDB ${settings.keys.omdb}`);
        if (settings.keys.ai) parts.push(`AI ${settings.keys.ai}`);
        settingsStatus.textContent = parts.length ? `Saved: ${parts.join(', ')}` : "No keys saved yet.";
        settingsStatus.style.color = parts.length ? "#10b981" : "var(--accent-1)";
    } catch (e) {
        settingsStatus.textContent = e.message;
        settingsStatus.style.color = "#ec4899";
    }
}

closeMovieInfo.addEventListener('click', () => movieInfoModal.classList.add('hidden'));

async function openMovieInfoModal(title) {
    searchModal.classList.add('hidden'); // Close search behind it
    movieInfoModal.classList.remove('hidden');
    
    infoTitle.textContent = title;
    infoMeta.textContent = "Loading data...";
    infoPlot.textContent = "Fetching plot...";
    infoDirector.textContent = "...";
    infoActors.textContent = "...";
    infoPoster.style.display = 'none';
    infoPoster.src = "";

    if (!hasApiKey('omdb')) {
        infoPlot.textContent = "Please set your OMDB API key in settings to fetch movie details.";
        return;
    }

    try {
        const res = await fetch(`/api/omdb?t=${encodeURIComponent(title)}`, { credentials: 'same-origin' });
        const data = await res.json();
        
        if (data.Response === "True") {
            infoTitle.textContent = data.Title;
            infoMeta.textContent = `${data.Year} • ${data.Rated} • ${data.Runtime} • ⭐ ${data.imdbRating}/10`;
            infoPlot.textContent = data.Plot !== "N/A" ? data.Plot : "No plot available.";
            infoDirector.textContent = data.Director;
            infoActors.textContent = data.Actors;
            
            if (data.Poster && data.Poster !== "N/A") {
                infoPoster.src = data.Poster;
                infoPoster.style.display = 'block';
            }
        } else {
            infoPlot.textContent = "Error fetching movie data. " + (data.Error || "");
        }
    } catch (e) {
        infoPlot.textContent = "Network error fetching movie details.";
    }
}

function performSearch() {
    const q = searchInput.value.toLowerCase().trim();
    searchResults.innerHTML = "";
    if (!q) return;

    // Deduplicate array of unique movie titles
    const allTitles = new Set();
    Object.values(movieDatabase).forEach(pool => {
        pool.forEach(m => allTitles.add(typeof m === 'object' ? m.title : m));
    });

    const matches = Array.from(allTitles).filter(t => t.toLowerCase().includes(q));
    
    if (matches.length === 0) {
        searchResults.innerHTML = `<div style="color:var(--text-secondary); padding: 1rem;">No movies found.</div>`;
        return;
    }

    // Limit to top 50 results for performance
    matches.slice(0, 50).forEach(title => {
        const item = document.createElement('div');
        item.className = 'search-item';
        
        const nameNode = document.createElement('span');
        nameNode.className = 'search-item-title';
        nameNode.textContent = title;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'search-item-action';
        delBtn.textContent = '❌ Delete';
        delBtn.onclick = () => {
            // Re-use delete logic
            let removed = false;
            for (const genre in movieDatabase) {
                const oldLen = movieDatabase[genre].length;
                movieDatabase[genre] = movieDatabase[genre].filter(m => {
                    const t = typeof m === 'object' ? m.title : m;
                    return t !== title;
                });
                if (movieDatabase[genre].length < oldLen) removed = true;
            }
            if (removed) {
                localStorage.setItem('omdb_movie_db', JSON.stringify(movieDatabase));
                updateLibraryCount();
                if (typeof autoHardcodeToSeed === 'function') autoHardcodeToSeed();
                item.style.display = 'none'; // hide instantly
            }
        };

        item.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            openMovieInfoModal(title);
        };
        item.style.cursor = 'pointer';

        item.appendChild(nameNode);
        item.appendChild(delBtn);
        searchResults.appendChild(item);
    });
}

searchBtn.addEventListener('click', () => {
    if (showsPage && showsPage.classList.contains('active-page')) {
        showSearchModal.classList.remove('hidden');
        showSearchInput.value = "";
        showSearchResults.innerHTML = "";
        setTimeout(() => showSearchInput.focus(), 100);
        return;
    }

    searchModal.classList.remove('hidden');
    searchInput.value = "";
    searchResults.innerHTML = "";
    setTimeout(() => searchInput.focus(), 100);
});

closeSearchModal.addEventListener('click', () => searchModal.classList.add('hidden'));
searchInput.addEventListener('input', performSearch);

function setCalibrationProgress(done, total, message = '') {
    const percent = total > 0 ? Math.round((done / total) * 100) : 100;
    calibrationCount.textContent = total > 0 ? `${done} of ${total} checked` : 'No missing ratings';
    calibrationPercent.textContent = `${percent}%`;
    calibrationProgressBar.style.width = `${percent}%`;
    if (message) calibrationStatus.textContent = message;
}

function refreshCalibrationSummary() {
    const missing = getMoviesMissingRatings().length;
    const total = getUniqueMovies().length;
    calibrationCount.textContent = `${missing} of ${total} missing ratings`;
    calibrationPercent.textContent = missing === 0 ? '100%' : '0%';
    calibrationProgressBar.style.width = missing === 0 ? '100%' : '0%';
    calibrationStatus.style.color = missing === 0 ? '#10b981' : 'var(--accent-1)';
    calibrationStatus.textContent = missing === 0
        ? 'Your library ratings are already calibrated.'
        : 'Ready to fetch missing ratings.';
    startCalibrationBtn.disabled = missing === 0;
}

calibrateBtn.addEventListener('click', () => {
    if (showsPage && showsPage.classList.contains('active-page')) {
        openShowCalibration();
        return;
    }

    openMovieCalibration();
});

closeCalibration.addEventListener('click', () => calibrationModal.classList.add('hidden'));
closeShowCalibration.addEventListener('click', () => showCalibrationModal.classList.add('hidden'));

function openMovieCalibration() {
    calibrationModal.classList.remove('hidden');
    refreshCalibrationSummary();
}

function openShowCalibration() {
    showCalibrationModal.classList.remove('hidden');
    refreshShowCalibrationSummary();
}

startCalibrationBtn.addEventListener('click', async () => {
    if (!hasApiKey('tmdb') && !hasApiKey('omdb')) {
        calibrationStatus.textContent = 'No movie API key found. Add a TMDb key in API Settings first.';
        calibrationStatus.style.color = '#ec4899';
        return;
    }

    const missingMovies = getMoviesMissingRatings();
    if (missingMovies.length === 0) {
        refreshCalibrationSummary();
        return;
    }

    startCalibrationBtn.disabled = true;
    closeCalibration.disabled = true;
    calibrationStatus.style.color = 'var(--accent-1)';

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < missingMovies.length; i++) {
        const title = getText(missingMovies[i]);
        setCalibrationProgress(i, missingMovies.length, `Fetching rating for ${title}`);
        const details = await fetchMovieDetails(title);
        if (details && details.limited) {
            closeCalibration.disabled = false;
            startCalibrationBtn.disabled = false;
            calibrationStatus.style.color = '#ec4899';
            calibrationStatus.textContent = 'OMDB request limit reached. Wait for the key to reset or add a new OMDB API key in settings.';
            setCalibrationProgress(i, missingMovies.length, `${updated} ratings saved before OMDB stopped requests.`);
            return;
        }
        if (details && parseMovieRating(details) !== null) updated++;
        else failed++;
        setCalibrationProgress(i + 1, missingMovies.length, `Saved ${updated} ratings${failed ? `, ${failed} skipped` : ''}.`);
        await sleep(150);
    }

    updateLibraryCount();
    autoHardcodeToSeed();
    closeCalibration.disabled = false;
    refreshCalibrationSummary();
    calibrationStatus.style.color = failed > 0 ? '#f59e0b' : '#10b981';
    calibrationStatus.textContent = failed > 0
        ? `Calibration finished. Saved ${updated} ratings; ${failed} could not be found.`
        : `Calibration finished. Saved ${updated} ratings.`;
});

authBtn.addEventListener('click', async () => {
    updateAuthUi();
    authModal.classList.remove('hidden');
    authStatus.textContent = authState.authenticated
        ? `Logged in as ${authState.username}.`
        : "";
    authStatus.style.color = "var(--accent-1)";
    if (authState.authenticated) {
        await refreshAccountSettingsStatus();
    }
    if (!authState.authenticated) {
        setTimeout(() => authUsername.focus(), 100);
    }
});

closeAuth.addEventListener('click', () => authModal.classList.add('hidden'));
loginBtn.addEventListener('click', () => runAuthAction('login'));
registerBtn.addEventListener('click', () => runAuthAction('register'));
authPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') runAuthAction('login');
});
logoutBtn.addEventListener('click', async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    await refreshAuthState();
    authStatus.textContent = "Logged out.";
    authStatus.style.color = "#10b981";
    authUsername.focus();
});

accountCalibrateMoviesBtn.addEventListener('click', () => {
    authModal.classList.add('hidden');
    openMovieCalibration();
});

accountCalibrateShowsBtn.addEventListener('click', () => {
    authModal.classList.add('hidden');
    openShowCalibration();
});

saveSettingsBtn.addEventListener('click', async () => {
    if (!authState.authenticated) {
        settingsStatus.textContent = "Login first, then save your API keys.";
        settingsStatus.style.color = "#ec4899";
        return;
    }

    try {
        await apiFetch('/api/settings', {
            method: 'POST',
            body: JSON.stringify({
                tmdb: tmdbKeyInput.value.trim(),
                omdb: apiKeyInput.value.trim(),
                ai: aiKeyInput.value.trim()
            })
        });
        await refreshAuthState();
        localStorage.removeItem('tmdb_api_key');
        localStorage.removeItem('omdb_api_key');
        localStorage.removeItem('openai_api_key');
        tmdbKeyInput.value = "";
        apiKeyInput.value = "";
        aiKeyInput.value = "";
        settingsStatus.textContent = 'Keys saved to your account.';
        settingsStatus.style.color = '#10b981';
        setTimeout(refreshAccountSettingsStatus, 800);
    } catch (e) {
        settingsStatus.textContent = e.message;
        settingsStatus.style.color = "#ec4899";
    }
});

// Automatic Hardcode Logic via Python Server
async function autoHardcodeToSeed() {
    let fileContent = `// Cinematic - Pre-categorized Seed Library\n// Auto-generated hardcoded database from browser state.\n\nconst SEED_LIBRARY = {\n`;
    const genresList = Object.keys(movieDatabase).sort();
    
    genresList.forEach((genre, gIndex) => {
        const movies = movieDatabase[genre];
        if (!movies || movies.length === 0) return;
        
        fileContent += `    "${genre}": [\n        `;
        const movieMap = new Map();
        movies.forEach(movie => {
            const title = getText(movie);
            const normalizedTitle = title.toLowerCase();
            const existing = movieMap.get(normalizedTitle);
            if (!existing || (parseMovieRating(existing) === null && parseMovieRating(movie) !== null)) {
                movieMap.set(normalizedTitle, movie);
            }
        });
        const movieEntries = Array.from(movieMap.values()).sort((a, b) => getText(a).localeCompare(getText(b)));
        
        for (let i = 0; i < movieEntries.length; i++) {
            const movie = movieEntries[i];
            if (typeof movie === 'object' && movie !== null) {
                const seedMovie = {
                    title: movie.title,
                    poster: movie.poster,
                    rating: movie.rating,
                    ratingSource: movie.ratingSource,
                    tmdbId: movie.tmdbId
                };
                fileContent += JSON.stringify(seedMovie);
            } else {
                fileContent += JSON.stringify(movie);
            }
            if (i !== movieEntries.length - 1) fileContent += `, `;
            if ((i + 1) % 3 === 0 && i !== movieEntries.length - 1) fileContent += `\n        `;
        }
        fileContent += `\n    ]`;
        if (gIndex !== genresList.length - 1) fileContent += `,\n`;
        else fileContent += `\n`;
    });
    
    fileContent += `};\n`;
    
    try {
        await fetch('http://127.0.0.1:5501/save-seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/javascript' },
            body: fileContent
        });
        console.log("Successfully hardcoded seed.js silently in the background.");
    } catch (e) {
        console.error("Failed to automatically hardcode seed.js:", e);
    }
}

function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const next = csvText[i + 1];

        if (char === '"' && inQuotes && next === '"') {
            cell += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(cell);
            cell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i++;
            row.push(cell);
            if (row.some(value => value.trim())) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    if (cell || row.length > 0) {
        row.push(cell);
        if (row.some(value => value.trim())) rows.push(row);
    }

    return rows;
}

function normalizeMovieTitleForMatch(title) {
    return String(title || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/^the\s+/, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '')
        .trim();
}

function extractLetterboxdTitles(csvText) {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) return [];

    const headers = rows[0].map(header => header.trim().toLowerCase());
    const nameIndex = headers.indexOf('name') !== -1 ? headers.indexOf('name') : headers.indexOf('title');
    if (nameIndex === -1) return [];

    return rows.slice(1)
        .map(row => (row[nameIndex] || '').trim())
        .filter(Boolean);
}

async function loadLetterboxdTitlesFromFolder() {
    const files = ['watched.csv', 'diary.csv', 'ratings.csv'];
    const titleSet = new Set();
    const loadedFiles = [];
    const missingFiles = [];

    for (const file of files) {
        try {
            const response = await fetch(file, { cache: 'no-store' });
            if (!response.ok) {
                missingFiles.push(file);
                continue;
            }

            const csvText = await response.text();
            const titles = extractLetterboxdTitles(csvText);
            titles.forEach(title => titleSet.add(title));
            loadedFiles.push(`${file} (${titles.length})`);
        } catch (e) {
            missingFiles.push(file);
        }
    }

    return {
        titles: Array.from(titleSet),
        loadedFiles,
        missingFiles
    };
}

function removeWatchedTitlesFromLibrary(titles) {
    const watchedTitles = new Set(titles.map(normalizeMovieTitleForMatch).filter(Boolean));
    const removedTitles = new Set();

    for (const genre in movieDatabase) {
        movieDatabase[genre] = movieDatabase[genre].filter(movie => {
            const title = getText(movie);
            const isWatched = watchedTitles.has(normalizeMovieTitleForMatch(title));
            if (isWatched) removedTitles.add(title);
            return !isWatched;
        });
    }

    return removedTitles;
}

function refreshWheelsAfterLibraryChange() {
    genres = Object.keys(movieDatabase);
    localStorage.setItem('omdb_movie_db', JSON.stringify(movieDatabase));
    updateLibraryCount();
    autoHardcodeToSeed();

    currentGenre = null;
    currentMovie = null;
    activeGenres = getPopulatedGenres();
    resetMood();

    genreDisplay.textContent = "?";
    movieDisplay.textContent = "Waiting for Genre...";
    document.getElementById('movie-details').classList.add('hidden');
    document.getElementById('movie-card').classList.remove('has-details');
    drawWheel(genreWheelCanvas, activeGenres.length > 0 ? activeGenres : ["?"]);
    drawWheel(movieWheelCanvas, ["?"]);
}

if (letterboxdBtn) {
    letterboxdBtn.addEventListener('click', () => {
        if (showsPage && showsPage.classList.contains('active-page')) return;
        letterboxdModal.classList.remove('hidden');
        letterboxdStatus.textContent = "Ready to scan watched.csv, diary.csv, and ratings.csv.";
        letterboxdStatus.style.color = "var(--accent-1)";
    });
}

if (closeLetterboxd) {
    closeLetterboxd.addEventListener('click', () => letterboxdModal.classList.add('hidden'));
}

if (processLetterboxdBtn) {
    processLetterboxdBtn.addEventListener('click', async () => {
        processLetterboxdBtn.disabled = true;
        letterboxdStatus.textContent = "Reading Letterboxd CSV files...";
        letterboxdStatus.style.color = "var(--accent-1)";

        try {
            const result = await loadLetterboxdTitlesFromFolder();

            if (result.loadedFiles.length === 0) {
                letterboxdStatus.textContent = "Could not read the CSV files. Start server.py, open http://127.0.0.1:5501, then try again.";
                letterboxdStatus.style.color = "#ec4899";
                return;
            }

            if (result.titles.length === 0) {
                letterboxdStatus.textContent = `Read ${result.loadedFiles.join(', ')}, but found no movie titles.`;
                letterboxdStatus.style.color = "#ec4899";
                return;
            }

            const removedTitles = removeWatchedTitlesFromLibrary(result.titles);

            if (removedTitles.size > 0) {
                refreshWheelsAfterLibraryChange();
                letterboxdStatus.textContent = `Removed ${removedTitles.size} watched movies using ${result.titles.length} Letterboxd titles.`;
                letterboxdStatus.style.color = "#10b981";
            } else {
                letterboxdStatus.textContent = `Checked ${result.titles.length} Letterboxd titles. Nothing in the wheel matched.`;
                letterboxdStatus.style.color = "#f59e0b";
            }
        } catch (e) {
            console.error("Letterboxd cleanup failed", e);
            letterboxdStatus.textContent = "Letterboxd cleanup failed. Check the console for details.";
            letterboxdStatus.style.color = "#ec4899";
        } finally {
            processLetterboxdBtn.disabled = false;
        }
    });
}

// Movie Import Modal Events
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (showsPage && showsPage.classList.contains('active-page')) {
            downloadShowExport();
            return;
        }

        downloadMovieExport();
    });
}

if (processCsvImportBtn) {
    processCsvImportBtn.addEventListener('click', async () => {
        const file = movieCsvFileInput && movieCsvFileInput.files ? movieCsvFileInput.files[0] : null;

        if (!file) {
            importStatus.textContent = "Choose a CSV backup first.";
            importStatus.style.color = "#ec4899";
            return;
        }

        processCsvImportBtn.disabled = true;
        importStatus.textContent = `Importing ${file.name}...`;
        importStatus.style.color = "var(--accent-1)";

        try {
            const csvText = await readFileAsText(file);
            const csvMovies = parseMovieExportCsv(csvText);

            if (csvMovies.length === 0) {
                importStatus.textContent = "No movie titles found in that CSV.";
                importStatus.style.color = "#ec4899";
                return;
            }

            const { addedCount, updatedCount } = mergeCsvMoviesIntoLibrary(csvMovies);
            refreshWheelsAfterLibraryChange();

            importStatus.textContent = `Imported ${csvMovies.length} movies. Added ${addedCount} genre entries, updated ${updatedCount}.`;
            importStatus.style.color = "#10b981";

            if (movieCsvFileInput) movieCsvFileInput.value = "";
        } catch (e) {
            console.error("CSV import failed", e);
            importStatus.textContent = "CSV import failed. Make sure it is a Cinematic export or has Title/Genres columns.";
            importStatus.style.color = "#ec4899";
        } finally {
            processCsvImportBtn.disabled = false;
        }
    });
}

importBtn.addEventListener('click', () => {
    if (showsPage && showsPage.classList.contains('active-page')) {
        showImportModal.classList.remove('hidden');
        const savedList = localStorage.getItem('cinematic_show_raw_list');
        if (savedList && !showListInput.value) showListInput.value = savedList;
        return;
    }

    importModal.classList.remove('hidden');
    const savedList = localStorage.getItem('omdb_movie_raw_list');
    if (savedList && !movieListInput.value) movieListInput.value = savedList;
});
closeModal.addEventListener('click', () => importModal.classList.add('hidden'));

processBtn.addEventListener('click', async () => {
    const tmdbApiKey = hasApiKey('tmdb');
    const omdbApiKey = hasApiKey('omdb');
    const rawMovies = movieListInput.value.trim();

    if (!tmdbApiKey && !omdbApiKey) {
        importStatus.textContent = "No API key saved. Open Account, paste your TMDb API Key or Read Access Token, then save.";
        importStatus.style.color = "#ec4899";
        return;
    }
    
    if (!tmdbApiKey && !omdbApiKey) {
        importStatus.textContent = "No OMDB key found. Please set it in Account.";
        importStatus.style.color = "#ec4899"; 
        return;
    }
    
    if (!rawMovies) {
        importStatus.textContent = "Please enter some movies.";
        importStatus.style.color = "#ec4899";
        return;
    }
    
    const movies = rawMovies.split('\n').map(m => m.trim()).filter(m => m);
    
    importStatus.textContent = `Processing ${movies.length} movies...`;
    importStatus.style.color = "var(--accent-1)";
    processBtn.disabled = true;
    
    let tempDb = {}; // holds newly fetched movies
    let successCount = 0;
    let skippedCount = 0;
    let firstError = '';
    let tmdbGenreMap = null;

    if (tmdbApiKey) {
        try {
            importStatus.textContent = "Loading TMDb genres...";
            tmdbGenreMap = await getTmdbGenreMap();
        } catch (e) {
            firstError = e.message;
            console.error("TMDb genre load failed", e);
            importStatus.textContent = "TMDb key could not be used. Check that it is pasted into the TMDb field in Settings.";
            importStatus.style.color = "#ec4899";
            processBtn.disabled = false;
            return;
        }
    }
    
    for (const rawTitle of movies) {
        const title = cleanTitle(rawTitle);

        // Skip fetching if movie is already in the database under any genre
        const alreadyExists = Object.values(movieDatabase).some(pool =>
            pool.some(m => (typeof m === 'object' ? m.title : m).toLowerCase() === title.toLowerCase())
        );
        if (alreadyExists) { skippedCount++; continue; }

        importStatus.textContent = `Fetching (${successCount + skippedCount + 1}/${movies.length}): ${title}`;
        try {
            if (tmdbApiKey && tmdbGenreMap) {
                const tmdbResult = await fetchTmdbMovie(title, tmdbGenreMap);
                if (tmdbResult) {
                    for (const genre of tmdbResult.genres) {
                        if (!tempDb[genre]) tempDb[genre] = [];
                        if (!tempDb[genre].find(m => m.title === tmdbResult.movie.title)) {
                            tempDb[genre].push(tmdbResult.movie);
                        }
                    }
                    successCount++;
                    await sleep(50);
                    continue;
                }
            }

            if (!omdbApiKey) {
                console.warn(`No TMDb match for ${title} and no OMDB fallback key is saved.`);
                continue;
            }

            const res = await fetch(`/api/omdb?t=${encodeURIComponent(title)}`, { credentials: 'same-origin' });
            const data = await res.json();
            
            if (data.Response === "True" && data.Genre) {
                // Split ALL OMDB genres (e.g. "Crime, Drama, Thriller") and add movie to each
                const allGenres = data.Genre.split(',').map(g => g.trim());
                
                const movieObj = {
                    title: data.Title,
                    poster: data.Poster,
                    rating: data.imdbRating,
                    ratingSource: 'IMDb'
                };

                for (const genre of allGenres) {
                    if (!tempDb[genre]) tempDb[genre] = [];
                    // Avoid duplicates within the same genre bucket
                    if (!tempDb[genre].find(m => m.title === movieObj.title)) {
                        tempDb[genre].push(movieObj);
                    }
                }
                successCount++;
            } else if (data.Response === "False" && data.Error) {
                if (!firstError) firstError = data.Error;
                if (isOmdbLimitError(data.Error)) {
                    importStatus.textContent = "OMDB limit reached. Save your TMDb key in Settings so imports can use TMDb instead.";
                    importStatus.style.color = "#ec4899";
                    processBtn.disabled = false;
                    return;
                }
                if (data.Error.includes("Invalid API key")) {
                    importStatus.textContent = "Error: Invalid OMDB API Key!";
                    importStatus.style.color = "#ec4899";
                    processBtn.disabled = false;
                    return;
                }
                console.warn(`OMDB failed for ${title}:`, data.Error);
            } else {
                console.warn(`No data for ${title}`);
            }
        } catch (e) {
            console.error(`Error fetching ${title}`, e);
        }
        
        await sleep(150); 
    }
    
    if (successCount > 0) {
        // MERGE new movies into existing database (never replace/wipe)
        for (const [genre, movies] of Object.entries(tempDb)) {
            if (!movieDatabase[genre]) movieDatabase[genre] = [];
            for (const m of movies) {
                if (!movieDatabase[genre].find(e => (typeof e === 'object' ? e.title : e) === m.title)) {
                    movieDatabase[genre].push(m);
                }
            }
        }
        genres = Object.keys(movieDatabase);
        
        // Save state persistently so it survives page reloads
        localStorage.setItem('omdb_movie_db', JSON.stringify(movieDatabase));
        localStorage.setItem('omdb_movie_raw_list', rawMovies);
        
        updateLibraryCount();
        autoHardcodeToSeed(); // Trigger silent backup

        // Reset current selection entirely
        currentGenre = null;
        currentMovie = null;
        genreDisplay.textContent = "?";
        movieDisplay.textContent = "Waiting for Genre...";
        activeGenres = getPopulatedGenres(); 
        resetMood();
        
        drawWheel(genreWheelCanvas, activeGenres); // Redraw the visual wheels
        drawWheel(movieWheelCanvas, ["?"]);
        
        const skipMsg = skippedCount > 0 ? ` (${skippedCount} already in library)` : '';
        importStatus.textContent = `✅ Added ${successCount} movies across ${genres.length} genres!${skipMsg}`;
        importStatus.style.color = "#10b981";
        
        setTimeout(() => {
            importModal.classList.add('hidden');
            importStatus.textContent = "";
        }, 2500);
    } else if (skippedCount === movies.length) {
        importStatus.textContent = `✅ All ${skippedCount} movies already in your library!`;
        importStatus.style.color = "#10b981";
    } else {
        const hint = firstError ? ` ${firstError}` : '';
        importStatus.textContent = `Could not fetch any movies.${hint}`;
        importStatus.style.color = "#ec4899";
    }
    
    processBtn.disabled = false;
});

// Shows section
const DEFAULT_SHOW_DATABASE = {
    "Drama": [
        { title: "Breaking Bad", poster: "N/A", rating: "9.5", ratingSource: "Starter" },
        { title: "Succession", poster: "N/A", rating: "8.8", ratingSource: "Starter" },
        { title: "The Sopranos", poster: "N/A", rating: "9.2", ratingSource: "Starter" }
    ],
    "Comedy": [
        { title: "The Bear", poster: "N/A", rating: "8.5", ratingSource: "Starter" },
        { title: "Atlanta", poster: "N/A", rating: "8.6", ratingSource: "Starter" },
        { title: "Fleabag", poster: "N/A", rating: "8.7", ratingSource: "Starter" }
    ],
    "Sci-Fi & Fantasy": [
        { title: "Severance", poster: "N/A", rating: "8.7", ratingSource: "Starter" },
        { title: "Arcane", poster: "N/A", rating: "9.0", ratingSource: "Starter" },
        { title: "Dark", poster: "N/A", rating: "8.7", ratingSource: "Starter" }
    ],
    "Crime": [
        { title: "True Detective", poster: "N/A", rating: "8.9", ratingSource: "Starter" },
        { title: "Mindhunter", poster: "N/A", rating: "8.6", ratingSource: "Starter" },
        { title: "Fargo", poster: "N/A", rating: "8.9", ratingSource: "Starter" }
    ]
};

let showDatabase = DEFAULT_SHOW_DATABASE;
const savedShowDb = localStorage.getItem('cinematic_show_db');
if (savedShowDb) {
    try {
        const parsed = JSON.parse(savedShowDb);
        if (parsed && Object.keys(parsed).length > 0) showDatabase = parsed;
    } catch (e) {
        console.error("Could not parse saved show DB", e);
    }
}

let showGenres = Object.keys(showDatabase);
let activeShowGenres = getPopulatedShowGenres();
let activeAIFilteredShows = null;
let currentShowGenre = null;
let currentShow = null;
let showGenreRotation = 0;
let showRotation = 0;

const moviesTab = document.getElementById('movies-tab');
const showsTab = document.getElementById('shows-tab');
const moviesPage = document.getElementById('movies-page');
const showsPage = document.getElementById('shows-page');
const showLibraryCountEl = document.getElementById('show-library-count');
const showGenreDisplay = document.getElementById('show-genre-display');
const showDisplay = document.getElementById('show-display');
const spinShowGenreBtn = document.getElementById('spin-show-genre-btn');
const spinShowBtn = document.getElementById('spin-show-btn');
const deleteShowBtn = document.getElementById('delete-show-btn');
const showGenreWheelCanvas = document.getElementById('show-genre-wheel-canvas');
const showWheelCanvas = document.getElementById('show-wheel-canvas');

const showMoodInput = document.getElementById('show-mood-text-input');
const showMoodSubmit = document.getElementById('show-mood-submit-btn');
const showMoodClear = document.getElementById('show-mood-clear-btn');
const showMoodFeedback = document.getElementById('show-mood-feedback');

const showRatingFilterSelect = document.getElementById('show-rating-filter-select');
const showSeasonFilterSelect = document.getElementById('show-season-filter-select');
const importShowBtn = document.getElementById('import-show-btn');
const exportShowBtn = document.getElementById('export-show-btn');
const searchShowBtn = document.getElementById('search-show-btn');
const showImportModal = document.getElementById('show-import-modal');
const closeShowModal = document.getElementById('close-show-modal');
const processShowImportBtn = document.getElementById('process-show-import-btn');
const showCsvFileInput = document.getElementById('show-csv-file');
const processShowCsvImportBtn = document.getElementById('process-show-csv-import-btn');
const showListInput = document.getElementById('show-list');
const showImportStatus = document.getElementById('show-import-status');
const showSearchModal = document.getElementById('show-search-modal');
const closeShowSearchModal = document.getElementById('close-show-search-modal');
const showSearchInput = document.getElementById('show-search-input');
const showSearchResults = document.getElementById('show-search-results');

function setActivePage(pageName) {
    const showMovies = pageName === 'movies';
    moviesPage.classList.toggle('hidden', !showMovies);
    moviesPage.classList.toggle('active-page', showMovies);
    showsPage.classList.toggle('hidden', showMovies);
    showsPage.classList.toggle('active-page', !showMovies);
    moviesTab.classList.toggle('active', showMovies);
    showsTab.classList.toggle('active', !showMovies);
    localStorage.setItem('cinematic_active_tab', pageName);
    document.title = showMovies ? "Cinematic - Movie Picker" : "Cinematic - Show Picker";

    if (libraryCountEl) {
        if (showMovies) {
            updateLibraryCount();
        } else {
            const uniqueShows = new Set();
            Object.values(showDatabase).forEach(pool => {
                pool.forEach(show => uniqueShows.add(getText(show)));
            });
            libraryCountEl.textContent = `${uniqueShows.size} Shows`;
        }
    }

    if (searchBtn) searchBtn.title = showMovies ? "Search Movies" : "Search Shows";
    if (importBtn) importBtn.textContent = showMovies ? "+ Add Movies" : "+ Add Shows";
    if (exportBtn) exportBtn.textContent = showMovies ? "Export" : "Export Shows";
    if (letterboxdBtn) letterboxdBtn.classList.toggle('hidden', !showMovies);
    if (calibrateBtn) calibrateBtn.textContent = showMovies ? "Calibrate" : "Calibrate Shows";

    if (!showMovies) {
        drawWheel(showGenreWheelCanvas, activeShowGenres.length > 0 ? activeShowGenres : ["?"]);
        drawWheel(showWheelCanvas, currentShowGenre ? (showDatabase[currentShowGenre] || ["?"]) : ["?"]);
    }
}

function saveShowDatabase() {
    localStorage.setItem('cinematic_show_db', JSON.stringify(showDatabase));
}

function getPopulatedShowGenres() {
    return showGenres.filter(g => showDatabase[g] && showDatabase[g].length > 0);
}

function updateShowLibraryCount() {
    const uniqueShows = new Set();
    Object.values(showDatabase).forEach(pool => {
        pool.forEach(show => uniqueShows.add(getText(show)));
    });
    if (showLibraryCountEl) showLibraryCountEl.textContent = `${uniqueShows.size} Shows`;
    if (libraryCountEl && showsPage && showsPage.classList.contains('active-page')) {
        libraryCountEl.textContent = `${uniqueShows.size} Shows`;
    }
}

function getSelectedShowRatingFilter() {
    return showRatingFilterSelect ? showRatingFilterSelect.value : 'any';
}

function showRatingMatches(show, filter = getSelectedShowRatingFilter()) {
    if (filter === 'any') return true;
    const rating = parseMovieRating(show);
    if (rating === null) return false;
    if (filter === 'under6') return rating < 6;
    return rating >= Number(filter);
}

function getShowRatingFilterLabel(filter = getSelectedShowRatingFilter()) {
    if (filter === 'any') return 'Any rating';
    if (filter === 'under6') return 'Under 6.0';
    return `${filter}.0+`;
}

function getSelectedShowSeasonFilter() {
    return showSeasonFilterSelect ? showSeasonFilterSelect.value : 'any';
}

function showSeasonMatches(show, filter = getSelectedShowSeasonFilter()) {
    if (filter === 'any') return true;
    if (typeof show !== 'object' || show === null || show.seasons === undefined || show.seasons === 'N/A') {
        // If seasons are unknown, we can either include or exclude. Let's include them so they don't disappear entirely.
        // Wait, if the user explicitly wants a long show, they probably don't want an unknown one.
        // Actually, let's include them to be safe, or maybe not. Let's include if we want to be lenient, but strict is better.
        // Let's exclude unknown if strict filter is applied.
        return false;
    }
    const seasons = Number(show.seasons);
    if (isNaN(seasons)) return false;
    
    if (filter === 'short') return seasons >= 1 && seasons <= 2;
    if (filter === 'medium') return seasons >= 3 && seasons <= 5;
    if (filter === 'long') return seasons >= 6;
    
    return true;
}

function getShowRatingFilteredPool(pool) {
    const ratingFilter = getSelectedShowRatingFilter();
    const seasonFilter = getSelectedShowSeasonFilter();
    
    if (ratingFilter === 'any' && seasonFilter === 'any') return pool;
    
    const seen = new Set();
    return pool.filter(show => {
        const title = normalizeMovieTitleForMatch(getText(show));
        if (seen.has(title)) return false;
        seen.add(title);
        
        return showRatingMatches(show, ratingFilter) && showSeasonMatches(show, seasonFilter);
    });
}

function refreshShowWheelsAfterLibraryChange() {
    showGenres = Object.keys(showDatabase);
    activeShowGenres = getPopulatedShowGenres();
    currentShowGenre = null;
    currentShow = null;
    saveShowDatabase();
    updateShowLibraryCount();
    resetShowMood();
    showGenreDisplay.textContent = "?";
    showDisplay.textContent = "Waiting for Genre...";
    document.getElementById('show-details').classList.add('hidden');
    document.getElementById('show-card').classList.remove('has-details');
    drawWheel(showGenreWheelCanvas, activeShowGenres.length > 0 ? activeShowGenres : ["?"]);
    drawWheel(showWheelCanvas, ["?"]);
    spinShowBtn.disabled = true;
}

function updateShowWheelsForMood() {
    currentShowGenre = null;
    currentShow = null;
    showGenreDisplay.textContent = "?";
    showDisplay.textContent = "Waiting for Genre...";
    document.getElementById('show-details').classList.add('hidden');
    document.getElementById('show-card').classList.remove('has-details');
    
    drawWheel(showGenreWheelCanvas, activeShowGenres.length > 0 ? activeShowGenres : ["?"]);
    drawWheel(showWheelCanvas, ["?"]);
    
    spinShowGenreBtn.disabled = false;
    spinShowBtn.disabled = true;
}

function basicShowKeywordParse(text) {
    let matchedGenres = new Set();
    const lowerText = text.toLowerCase();
    
    for (const [keyword, gList] of Object.entries(keywordToGenres)) {
        if (lowerText.includes(keyword)) {
            gList.forEach(g => {
                const possible = showGenres.filter(sg => sg.toLowerCase().includes(g.toLowerCase()));
                possible.forEach(pg => matchedGenres.add(pg));
            });
        }
    }
    
    if (matchedGenres.size > 0) {
        activeShowGenres = Array.from(matchedGenres).filter(g => showDatabase[g] && showDatabase[g].length > 0);
        if (activeShowGenres.length === 0) activeShowGenres = getPopulatedShowGenres();
        if (showMoodFeedback) {
            showMoodFeedback.textContent = `Interpreted as: ${activeShowGenres.join(', ')} (Basic Mode)`;
            showMoodFeedback.style.color = "var(--accent-1)";
        }
    } else {
        activeShowGenres = getPopulatedShowGenres();
        if (showMoodFeedback) {
            showMoodFeedback.textContent = "Couldn't pinpoint exactly. Dropping everything in!";
            showMoodFeedback.style.color = "var(--text-secondary)";
        }
    }
    updateShowWheelsForMood();
}

async function parseShowMoodText() {
    if (!showMoodInput) return;
    const text = showMoodInput.value.trim();
    if (!text) {
        resetShowMood();
        return;
    }
    
    if (showMoodFeedback) {
        showMoodFeedback.textContent = "AI is thinking...";
        showMoodFeedback.style.color = "var(--text-secondary)";
    }
    showMoodInput.disabled = true;
    if (showMoodSubmit) showMoodSubmit.disabled = true;
    
    try {
        let reply = "";
        const aiKey = getApiKey('ai');
        
        if (aiKey && authState.aiProvider === 'gemini') {
            const allShowsSet = new Set();
            for (const pool of Object.values(showDatabase)) {
                pool.forEach(m => allShowsSet.add(typeof m === 'object' ? m.title : m));
            }
            const allShowsList = Array.from(allShowsSet).join(', ');

            const modelList = await apiFetch('/api/ai/gemini/models', { method: 'POST' });
            const targetModel = modelList.models.find(m => m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent')).name;
            const data = await apiFetch('/api/ai/gemini/generate', {
                method: 'POST',
                body: JSON.stringify({
                    model: targetModel,
                    system_instruction: {
                        parts: { text: `You are an expert TV show recommendation engine that understands human emotions, tone, pacing, and intent.\nHere is the user's local show library:\n${allShowsList}\n\nYour job is to analyze the user's input and output:\n1. 'genres': Array of 2-3 accurate broad genres from the allowed list: ${showGenres.join(', ')}.\n2. 'tags': Array of 5-10 highly specific descriptive keywords/tropes.\n3. 'movies': Array of 30-50 exact show titles from the provided library list above that match ANY of your generated tags or the general vibe. Do NOT hallucinate shows not in the library. This list will populate the final wheel.` }
                    },
                    contents: [{
                        parts: [{ text: `User mood: "${text}"` }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                genres: { type: "ARRAY", items: { type: "STRING" } },
                                tags: { type: "ARRAY", items: { type: "STRING" } },
                                movies: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: ["genres", "tags", "movies"]
                        }
                    }
                })
            });
            if (data.error) throw new Error(data.error.message);
            const raw = data.candidates[0].content.parts[0].text;
            const parsed = JSON.parse(raw);
            reply = parsed.genres.join(', ');
            
            if (parsed.movies && parsed.movies.length > 0) {
                activeAIFilteredShows = parsed.movies.map(m => m.toLowerCase());
            } else {
                activeAIFilteredShows = null;
            }
        } else if (aiKey && authState.aiProvider === 'openai') {
            const data = await apiFetch('/api/ai/openai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {role: "system", content: `You are an expert show recommendation engine that understands human emotions.\nThe ONLY exact genres you can pick from are: ${showGenres.join(', ')}. Restrict your output to these.\nInterpret the user's emotional state, themes, complexity, energy, and tone.\nRULES: Return 3-5 genres max. Prioritize the best match. Return ONLY a comma-separated list of genres (no explanation, no markdown).`},
                        {role: "user", content: `User mood: "${text}"`}
                    ],
                    temperature: 0.2,
                    max_tokens: 30
                })
            });
            if (data.error) throw new Error(data.error.message);
            reply = data.choices[0].message.content;
        } else {
            const prompt = `You are a strict categorization engine. The user's mood is: "${text}". The ONLY available exact genres are: ${showGenres.join(', ')}. Return ONLY a comma-separated list of the best matching genres from that exact list. Do NOT write full sentences. Do NOT return emojis. ONLY return known genres.`;
            const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
            if (!response.ok) throw new Error("Free AI network limit reached");
            reply = await response.text();
        }
        
        let matchedGenres = new Set();
        showGenres.forEach(g => {
            const regex = new RegExp(`\\b${g.split('&')[0].trim()}\\b`, 'i');
            if (regex.test(reply)) matchedGenres.add(g);
        });
        
        if (matchedGenres.size > 0) {
            activeShowGenres = Array.from(matchedGenres).filter(g => showDatabase[g] && showDatabase[g].length > 0);
            if (activeShowGenres.length === 0) activeShowGenres = getPopulatedShowGenres();
            
            if (showMoodFeedback) {
                showMoodFeedback.textContent = `AI Interpreted: ${activeShowGenres.join(', ')}`;
                showMoodFeedback.style.color = "var(--accent-1)";
            }
        } else {
            throw new Error("No direct genres mapped: " + reply);
        }
        updateShowWheelsForMood();
    } catch (e) {
        console.warn("AI Model failed or was uncertain, falling back to local heuristic...", e);
        basicShowKeywordParse(text);
    } finally {
        if (showMoodInput) showMoodInput.disabled = false;
        if (showMoodSubmit) showMoodSubmit.disabled = false;
        if (showMoodInput) showMoodInput.focus();
    }
}

function resetShowMood() {
    if (showMoodInput) showMoodInput.value = "";
    activeShowGenres = getPopulatedShowGenres();
    activeAIFilteredShows = null;
    if (showMoodFeedback) showMoodFeedback.textContent = "";
    updateShowWheelsForMood();
}

if (showMoodSubmit) showMoodSubmit.addEventListener('click', parseShowMoodText);
if (showMoodInput) showMoodInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') parseShowMoodText();
});
if (showMoodClear) showMoodClear.addEventListener('click', resetShowMood);


async function getTmdbShowGenreMap() {
    const data = await tmdbFetch('/genre/tv/list', { language: 'en-US' });
    const map = new Map();
    if (data && Array.isArray(data.genres)) {
        data.genres.forEach(genre => map.set(genre.id, genre.name));
    }
    return map;
}

function getShowSearchYear(title) {
    const match = String(title || '').match(/\b(19\d{2}|20\d{2})\b/);
    return match ? match[1] : '';
}

function cleanShowTitleForSearch(title) {
    return String(title || '')
        .replace(/^\s*[-*•]+\s*/, '')
        .replace(/^\s*\d+[\).\-\s]+/, '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\((?:19\d{2}|20\d{2})\)/g, ' ')
        .replace(/\b(?:season|series)\s+\d+\b/ig, ' ')
        .replace(/\bs\d{1,2}\b/ig, ' ')
        .replace(/\b(?:tv show|tv series|series|show|anime)\b/ig, ' ')
        .replace(/\s+-\s+.*$/, ' ')
        .replace(/\s+[\|:]\s+.*$/, ' ')
        .replace(/["'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getShowSearchCandidates(title) {
    const raw = String(title || '').trim();
    const cleaned = cleanShowTitleForSearch(raw);
    const candidates = [
        raw,
        cleaned,
        raw.split(/\s+-\s+|\s+\|\s+/)[0],
        cleaned.split(':')[0],
        cleaned.replace(/\bthe\b/ig, '').replace(/\s+/g, ' ').trim()
    ];

    return Array.from(new Set(candidates.map(candidate => candidate.trim()).filter(Boolean)));
}

function scoreTmdbShowResult(result, title) {
    const target = normalizeMovieTitleForMatch(cleanShowTitleForSearch(title));
    const names = [result.name, result.original_name].filter(Boolean);
    let score = 0;

    names.forEach(name => {
        const normalizedName = normalizeMovieTitleForMatch(name);
        if (normalizedName === target) score = Math.max(score, 100);
        else if (target && normalizedName.includes(target)) score = Math.max(score, 75);
        else if (normalizedName && target.includes(normalizedName)) score = Math.max(score, 65);
    });

    score += Math.min(Number(result.popularity) || 0, 30);
    if (result.poster_path) score += 5;
    if (Number.isFinite(result.vote_average) && result.vote_average > 0) score += 5;
    return score;
}

function buildTmdbShowResult(result, title, genreMap) {
    const genreNames = (result.genre_ids || [])
        .map(id => genreMap.get(id))
        .filter(Boolean);

    return {
        show: {
            title: result.name || result.original_name || title,
            poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : 'N/A',
            rating: Number.isFinite(result.vote_average) ? result.vote_average.toFixed(1) : 'N/A',
            ratingSource: 'TMDb',
            tmdbId: result.id,
            seasons: result.number_of_seasons !== undefined ? result.number_of_seasons : 'N/A'
        },
        genres: genreNames.length > 0 ? genreNames : ['Uncategorized']
    };
}

async function fetchTmdbShow(title, genreMap) {
    const year = getShowSearchYear(title);
    const candidates = getShowSearchCandidates(title);
    let bestResult = null;
    let bestScore = -1;

    for (const candidate of candidates) {
        const searchParams = {
            query: candidate,
            include_adult: 'false',
            language: 'en-US',
            page: 1
        };

        if (year) searchParams.first_air_date_year = year;

        let data = await tmdbFetch('/search/tv', searchParams);
        let results = data && Array.isArray(data.results) ? data.results : [];

        if (results.length === 0 && year) {
            data = await tmdbFetch('/search/tv', {
                query: candidate,
                include_adult: 'false',
                language: 'en-US',
                page: 1
            });
            results = data && Array.isArray(data.results) ? data.results : [];
        }

        for (const result of results.slice(0, 5)) {
            const score = scoreTmdbShowResult(result, candidate);
            if (score > bestScore) {
                bestResult = result;
                bestScore = score;
            }
        }

        if (bestScore >= 100) break;
    }

    if (!bestResult) {
        for (const candidate of candidates) {
            const data = await tmdbFetch('/search/multi', {
                query: candidate,
                include_adult: 'false',
                language: 'en-US',
                page: 1
            });
            const results = data && Array.isArray(data.results)
                ? data.results.filter(result => result.media_type === 'tv')
                : [];

            for (const result of results.slice(0, 5)) {
                const score = scoreTmdbShowResult(result, candidate);
                if (score > bestScore) {
                    bestResult = result;
                    bestScore = score;
                }
            }

            if (bestResult) break;
        }
    }

    if (bestResult && bestResult.id) {
        try {
            const details = await tmdbFetch(`/tv/${bestResult.id}`, { language: 'en-US' });
            if (details && details.number_of_seasons !== undefined) {
                bestResult.number_of_seasons = details.number_of_seasons;
            }
        } catch (e) {
            console.error("Failed to fetch season details for", title, e);
        }
    }

    return bestResult ? buildTmdbShowResult(bestResult, title, genreMap) : null;
}

function showExistsInGenre(title, genre) {
    const normalizedTitle = normalizeMovieTitleForMatch(title);
    return Boolean(showDatabase[genre] && showDatabase[genre].some(show =>
        normalizeMovieTitleForMatch(getText(show)) === normalizedTitle
    ));
}

function showNeedsCalibration(show) {
    const title = getText(show);
    if (typeof show !== 'object' || show === null) return true;
    if (parseMovieRating(show) === null) return true;
    if (!show.poster || show.poster === "N/A") return true;
    if (show.seasons === undefined || show.seasons === "N/A") return true;
    return showExistsInGenre(title, 'Uncategorized');
}

function getUniqueShows() {
    const showsByTitle = new Map();

    Object.values(showDatabase).forEach(pool => {
        pool.forEach(show => {
            const title = getText(show);
            const normalizedTitle = normalizeMovieTitleForMatch(title);
            const existing = showsByTitle.get(normalizedTitle);
            if (!existing || showNeedsCalibration(existing)) {
                showsByTitle.set(normalizedTitle, show);
            }
        });
    });

    return Array.from(showsByTitle.values()).sort((a, b) => getText(a).localeCompare(getText(b)));
}

function getShowsNeedingCalibration() {
    return getUniqueShows().filter(show => showNeedsCalibration(show));
}

function replaceShowWithTmdbResult(oldTitle, tmdbResult) {
    const normalizedOldTitle = normalizeMovieTitleForMatch(oldTitle);

    for (const genre in showDatabase) {
        showDatabase[genre] = showDatabase[genre].filter(show =>
            normalizeMovieTitleForMatch(getText(show)) !== normalizedOldTitle
        );
    }

    tmdbResult.genres.forEach(genre => {
        if (!showDatabase[genre]) showDatabase[genre] = [];
        const exists = showDatabase[genre].some(show =>
            normalizeMovieTitleForMatch(getText(show)) === normalizeMovieTitleForMatch(tmdbResult.show.title)
        );
        if (!exists) showDatabase[genre].push(tmdbResult.show);
    });
}

function setShowCalibrationProgress(done, total, message = '') {
    const percent = total > 0 ? Math.round((done / total) * 100) : 100;
    showCalibrationCount.textContent = total > 0 ? `${done} of ${total} checked` : 'No missing show details';
    showCalibrationPercent.textContent = `${percent}%`;
    showCalibrationProgressBar.style.width = `${percent}%`;
    if (message) showCalibrationStatus.textContent = message;
}

function refreshShowCalibrationSummary() {
    const missing = getShowsNeedingCalibration().length;
    const total = getUniqueShows().length;
    showCalibrationCount.textContent = `${missing} of ${total} need details`;
    showCalibrationPercent.textContent = missing === 0 ? '100%' : '0%';
    showCalibrationProgressBar.style.width = missing === 0 ? '100%' : '0%';
    showCalibrationStatus.style.color = missing === 0 ? '#10b981' : 'var(--accent-1)';
    showCalibrationStatus.textContent = missing === 0
        ? 'Your show library is already calibrated.'
        : 'Ready to retry missing show details.';
    startShowCalibrationBtn.disabled = missing === 0;
}

function mergeCsvShowsIntoLibrary(csvShows) {
    let addedCount = 0;
    let updatedCount = 0;

    csvShows.forEach(csvShow => {
        const showObj = {
            title: csvShow.title,
            poster: csvShow.poster,
            rating: csvShow.rating,
            ratingSource: csvShow.ratingSource,
            tmdbId: csvShow.tmdbId,
            seasons: csvShow.seasons
        };

        Object.keys(showObj).forEach(key => {
            if (showObj[key] === '' || showObj[key] === undefined) delete showObj[key];
        });

        csvShow.genres.forEach(genre => {
            if (!showDatabase[genre]) showDatabase[genre] = [];

            const normalizedTitle = normalizeMovieTitleForMatch(csvShow.title);
            const existingIndex = showDatabase[genre].findIndex(show =>
                normalizeMovieTitleForMatch(getText(show)) === normalizedTitle
            );

            if (existingIndex === -1) {
                showDatabase[genre].push(showObj);
                addedCount++;
                return;
            }

            const existingShow = showDatabase[genre][existingIndex];
            showDatabase[genre][existingIndex] = {
                ...(typeof existingShow === 'object' && existingShow !== null ? existingShow : {}),
                ...showObj
            };
            updatedCount++;
        });
    });

    return { addedCount, updatedCount };
}

function getShowExportRows() {
    const showsByTitle = new Map();

    Object.entries(showDatabase).forEach(([genre, pool]) => {
        pool.forEach(show => {
            const title = getText(show);
            const normalizedTitle = title.toLowerCase();
            const existing = showsByTitle.get(normalizedTitle) || {
                show,
                genres: new Set()
            };

            existing.genres.add(genre);
            if (parseMovieRating(existing.show) === null && parseMovieRating(show) !== null) {
                existing.show = show;
            }
            showsByTitle.set(normalizedTitle, existing);
        });
    });

    return Array.from(showsByTitle.values())
        .map(({ show, genres }) => ({
            title: getText(show),
            genres: Array.from(genres).sort().join('; '),
            rating: typeof show === 'object' && show !== null ? show.rating || '' : '',
            ratingSource: typeof show === 'object' && show !== null ? show.ratingSource || '' : '',
            tmdbId: typeof show === 'object' && show !== null ? show.tmdbId || '' : '',
            poster: typeof show === 'object' && show !== null ? show.poster || '' : '',
            seasons: typeof show === 'object' && show !== null ? show.seasons || '' : ''
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
}

function downloadShowExport() {
    const rows = getShowExportRows();
    if (rows.length === 0) return;

    const header = ['Title', 'Genres', 'Rating', 'Rating Source', 'TMDb ID', 'Poster', 'Seasons'];
    const csvLines = [
        header.map(csvEscape).join(','),
        ...rows.map(row => [
            row.title,
            row.genres,
            row.rating,
            row.ratingSource,
            row.tmdbId,
            row.poster,
            row.seasons
        ].map(csvEscape).join(','))
    ];

    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cinematic-shows-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function removeShowTitle(title) {
    let removed = false;
    for (const genre in showDatabase) {
        const oldLength = showDatabase[genre].length;
        showDatabase[genre] = showDatabase[genre].filter(show =>
            normalizeMovieTitleForMatch(getText(show)) !== normalizeMovieTitleForMatch(title)
        );
        if (showDatabase[genre].length < oldLength) removed = true;
    }
    if (removed) refreshShowWheelsAfterLibraryChange();
    return removed;
}

async function calculateAndSpinShow(genre, spinDur) {
    const basePool = showDatabase[genre] || [];
    const filteredBasePool = getShowRatingFilteredPool(basePool);

    if (filteredBasePool.length === 0) {
        currentShow = null;
        showDisplay.textContent = `No matching shows here (Try calibrating!)`;
        drawWheel(showWheelCanvas, ["No match"]);
        document.getElementById('show-details').classList.add('hidden');
        document.getElementById('show-card').classList.remove('has-details');
        return;
    }

    const aiMatchPool = [];
    const tiers = { 3: [], 2: [], 1: [] };
    const seenTitles = new Set();
    
    filteredBasePool.forEach(show => {
        const title = typeof show === 'object' ? show.title : show;
        if (seenTitles.has(title)) return;
        seenTitles.add(title);
        
        if (activeAIFilteredShows && activeAIFilteredShows.includes(title.toLowerCase())) {
            aiMatchPool.push(show);
        }
        
        let score = 0;
        activeShowGenres.forEach(g => {
            if (showDatabase[g] && showDatabase[g].find(e => (typeof e === 'object' ? e.title : e) === title)) {
                score++;
            }
        });
        
        if (score >= 3) tiers[3].push(show);
        else if (score === 2) tiers[2].push(show);
        else tiers[1].push(show);
    });

    let finalPool = [];
    if (aiMatchPool.length > 0) finalPool = aiMatchPool;
    else if (tiers[3].length > 0) finalPool = tiers[3];
    else if (tiers[2].length > 0) finalPool = tiers[2];
    else if (tiers[1].length > 0) finalPool = tiers[1];

    if (finalPool.length === 0) finalPool = filteredBasePool;

    const previousShowTitle = currentShow ? getText(currentShow) : null;
    currentShow = getRandomItemExcludingTitle(finalPool, previousShowTitle);
    if (!currentShow) currentShow = finalPool[0];
    const displayPool = finalPool.slice(0, 50);

    if (deleteShowBtn && currentShow) {
        deleteShowBtn.dataset.title = getText(currentShow);
        deleteShowBtn.textContent = "Mark as Watched";
        deleteShowBtn.style.color = "";
        deleteShowBtn.style.borderColor = "";
        deleteShowBtn.style.background = "";
    }

    drawWheel(showWheelCanvas, displayPool);
    showRotation = spinVisualWheel(showWheelCanvas, '.show-pointer', showRotation, displayPool, currentShow || "?", spinDur);
    await spinEffect(showDisplay, displayPool, currentShow || "?", spinDur);

    if (typeof currentShow === 'object' && currentShow !== null) {
        const details = document.getElementById('show-details');
        const poster = document.getElementById('show-poster');
        const rating = document.getElementById('show-rating-val');
        const ratingSource = document.getElementById('show-rating-source');

        if (currentShow.poster && currentShow.poster !== "N/A") {
            poster.src = currentShow.poster;
            poster.style.display = 'block';
        } else {
            poster.style.display = 'none';
        }

        rating.textContent = currentShow.rating || "??";
        ratingSource.textContent = currentShow.ratingSource || "Rating";
        
        const seasonsVal = document.getElementById('show-seasons-val');
        if (seasonsVal) {
            seasonsVal.textContent = currentShow.seasons !== undefined && currentShow.seasons !== 'N/A' 
                ? currentShow.seasons 
                : "?";
        }
        
        details.classList.remove('hidden');
        document.getElementById('show-card').classList.add('has-details');
    }
}

function performShowSearch() {
    const q = showSearchInput.value.toLowerCase().trim();
    showSearchResults.innerHTML = "";
    if (!q) return;

    const allTitles = new Set();
    Object.values(showDatabase).forEach(pool => {
        pool.forEach(show => allTitles.add(getText(show)));
    });

    const matches = Array.from(allTitles).filter(title => title.toLowerCase().includes(q));

    if (matches.length === 0) {
        showSearchResults.innerHTML = `<div style="color:var(--text-secondary); padding: 1rem;">No shows found.</div>`;
        return;
    }

    matches.slice(0, 50).forEach(title => {
        const item = document.createElement('div');
        item.className = 'search-item';

        const nameNode = document.createElement('span');
        nameNode.className = 'search-item-title';
        nameNode.textContent = title;

        const delBtn = document.createElement('button');
        delBtn.className = 'search-item-action';
        delBtn.textContent = 'Delete';
        delBtn.onclick = () => {
            if (removeShowTitle(title)) item.style.display = 'none';
        };

        item.appendChild(nameNode);
        item.appendChild(delBtn);
        showSearchResults.appendChild(item);
    });
}

moviesTab.addEventListener('click', () => setActivePage('movies'));
showsTab.addEventListener('click', () => setActivePage('shows'));

if (showRatingFilterSelect) {
    showRatingFilterSelect.value = localStorage.getItem('show_rating_filter') || 'any';
    showRatingFilterSelect.addEventListener('change', () => {
        localStorage.setItem('show_rating_filter', showRatingFilterSelect.value);
        if (currentShowGenre) {
            showDisplay.textContent = "Re-roll for this filter...";
            document.getElementById('show-details').classList.add('hidden');
            document.getElementById('show-card').classList.remove('has-details');
        }
    });
}

if (showSeasonFilterSelect) {
    showSeasonFilterSelect.value = localStorage.getItem('show_season_filter') || 'any';
    showSeasonFilterSelect.addEventListener('change', () => {
        localStorage.setItem('show_season_filter', showSeasonFilterSelect.value);
        if (currentShowGenre) {
            showDisplay.textContent = "Re-roll for this filter...";
            document.getElementById('show-details').classList.add('hidden');
            document.getElementById('show-card').classList.remove('has-details');
        }
    });
}

spinShowGenreBtn.addEventListener('click', async () => {
    if (activeShowGenres.length === 0) return;
    initAudio();
    spinShowGenreBtn.disabled = true;
    spinShowBtn.disabled = true;
    document.getElementById('show-details').classList.add('hidden');
    document.getElementById('show-card').classList.remove('has-details');

    currentShowGenre = getRandomItem(activeShowGenres);
    const spinDur = 2500;
    drawWheel(showGenreWheelCanvas, activeShowGenres);
    showGenreRotation = spinVisualWheel(showGenreWheelCanvas, '.show-genre-pointer', showGenreRotation, activeShowGenres, currentShowGenre, spinDur);

    const genreProm = spinEffect(showGenreDisplay, activeShowGenres, currentShowGenre, spinDur);
    const showProm = calculateAndSpinShow(currentShowGenre, spinDur + 500);
    await Promise.all([genreProm, showProm]);

    spinShowGenreBtn.disabled = false;
    spinShowBtn.disabled = false;
});

spinShowBtn.addEventListener('click', async () => {
    if (!currentShowGenre) return;
    initAudio();
    spinShowGenreBtn.disabled = true;
    spinShowBtn.disabled = true;
    document.getElementById('show-details').classList.add('hidden');
    document.getElementById('show-card').classList.remove('has-details');

    await calculateAndSpinShow(currentShowGenre, 2500);

    spinShowGenreBtn.disabled = false;
    spinShowBtn.disabled = false;
});

startShowCalibrationBtn.addEventListener('click', async () => {
    if (!hasApiKey('tmdb')) {
        showCalibrationStatus.textContent = 'No TMDb key found. Save a TMDb key in Account first.';
        showCalibrationStatus.style.color = '#ec4899';
        return;
    }

    const missingShows = getShowsNeedingCalibration();
    if (missingShows.length === 0) {
        refreshShowCalibrationSummary();
        return;
    }

    startShowCalibrationBtn.disabled = true;
    closeShowCalibration.disabled = true;
    showCalibrationStatus.style.color = 'var(--accent-1)';

    let genreMap;
    try {
        showCalibrationStatus.textContent = 'Loading TMDb show genres...';
        genreMap = await getTmdbShowGenreMap();
    } catch (e) {
        closeShowCalibration.disabled = false;
        startShowCalibrationBtn.disabled = false;
        showCalibrationStatus.textContent = 'TMDb key could not be used. Check Account API settings.';
        showCalibrationStatus.style.color = '#ec4899';
        return;
    }

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < missingShows.length; i++) {
        const title = getText(missingShows[i]);
        setShowCalibrationProgress(i, missingShows.length, `Fetching show details for ${title}`);

        try {
            const tmdbResult = await fetchTmdbShow(title, genreMap);
            if (tmdbResult) {
                replaceShowWithTmdbResult(title, tmdbResult);
                updated++;
            } else {
                failed++;
            }
        } catch (e) {
            console.error(`Show calibration failed for ${title}`, e);
            failed++;
        }

        setShowCalibrationProgress(i + 1, missingShows.length, `Saved ${updated} shows${failed ? `, ${failed} skipped` : ''}.`);
        await sleep(120);
    }

    saveShowDatabase();
    updateShowLibraryCount();
    refreshShowWheelsAfterLibraryChange();
    closeShowCalibration.disabled = false;
    refreshShowCalibrationSummary();
    showCalibrationStatus.style.color = failed > 0 ? '#f59e0b' : '#10b981';
    showCalibrationStatus.textContent = failed > 0
        ? `Show calibration finished. Saved ${updated}; ${failed} still need manual cleanup or alternate titles.`
        : `Show calibration finished. Saved ${updated}.`;
});

deleteShowBtn.addEventListener('click', () => {
    const titleToRemove = deleteShowBtn.dataset.title;
    if (!titleToRemove) return;
    if (removeShowTitle(titleToRemove)) {
        deleteShowBtn.textContent = "Removed";
        deleteShowBtn.style.color = "#10b981";
        deleteShowBtn.style.borderColor = "rgba(16, 185, 129, 0.3)";
        deleteShowBtn.style.background = "rgba(16, 185, 129, 0.1)";
    }
});

importShowBtn.addEventListener('click', () => {
    showImportModal.classList.remove('hidden');
    const savedList = localStorage.getItem('cinematic_show_raw_list');
    if (savedList && !showListInput.value) showListInput.value = savedList;
});

closeShowModal.addEventListener('click', () => showImportModal.classList.add('hidden'));
exportShowBtn.addEventListener('click', downloadShowExport);

processShowCsvImportBtn.addEventListener('click', async () => {
    const file = showCsvFileInput && showCsvFileInput.files ? showCsvFileInput.files[0] : null;
    if (!file) {
        showImportStatus.textContent = "Choose a CSV backup first.";
        showImportStatus.style.color = "#ec4899";
        return;
    }

    processShowCsvImportBtn.disabled = true;
    showImportStatus.textContent = `Importing ${file.name}...`;
    showImportStatus.style.color = "var(--accent-1)";

    try {
        const csvText = await readFileAsText(file);
        const csvShows = parseMovieExportCsv(csvText);
        if (csvShows.length === 0) {
            showImportStatus.textContent = "No show names found in that CSV.";
            showImportStatus.style.color = "#ec4899";
            return;
        }

        const { addedCount, updatedCount } = mergeCsvShowsIntoLibrary(csvShows);
        refreshShowWheelsAfterLibraryChange();
        showImportStatus.textContent = `Imported ${csvShows.length} shows. Added ${addedCount} genre entries, updated ${updatedCount}.`;
        showImportStatus.style.color = "#10b981";
        showCsvFileInput.value = "";
    } catch (e) {
        console.error("Show CSV import failed", e);
        showImportStatus.textContent = "CSV import failed. Make sure it has Title/Genres columns.";
        showImportStatus.style.color = "#ec4899";
    } finally {
        processShowCsvImportBtn.disabled = false;
    }
});

processShowImportBtn.addEventListener('click', async () => {
    const rawShows = showListInput.value.trim();
    if (!rawShows) {
        showImportStatus.textContent = "Please enter some shows.";
        showImportStatus.style.color = "#ec4899";
        return;
    }

    const titles = rawShows.split('\n').map(show => cleanTitle(show)).filter(Boolean);
    const tmdbApiKey = getApiKey('tmdb');
    const tempDb = {};
    let successCount = 0;
    let skippedCount = 0;
    let genreMap = null;

    processShowImportBtn.disabled = true;
    showImportStatus.textContent = `Processing ${titles.length} shows...`;
    showImportStatus.style.color = "var(--accent-1)";

    if (tmdbApiKey) {
        try {
            showImportStatus.textContent = "Loading TMDb show genres...";
            genreMap = await getTmdbShowGenreMap();
        } catch (e) {
            console.error("TMDb TV genre load failed", e);
            showImportStatus.textContent = "TMDb key could not be used. Shows will be added without fetched details.";
            showImportStatus.style.color = "#f59e0b";
        }
    }

    for (const title of titles) {
        const alreadyExists = Object.values(showDatabase).some(pool =>
            pool.some(show => normalizeMovieTitleForMatch(getText(show)) === normalizeMovieTitleForMatch(title))
        );
        if (alreadyExists) {
            skippedCount++;
            continue;
        }

        showImportStatus.textContent = `Fetching (${successCount + skippedCount + 1}/${titles.length}): ${title}`;
        let added = false;

        if (tmdbApiKey && genreMap) {
            try {
                const tmdbResult = await fetchTmdbShow(title, genreMap);
                if (tmdbResult) {
                    tmdbResult.genres.forEach(genre => {
                        if (!tempDb[genre]) tempDb[genre] = [];
                        tempDb[genre].push(tmdbResult.show);
                    });
                    added = true;
                }
            } catch (e) {
                console.error(`Error fetching show ${title}`, e);
            }
        }

        if (!added) {
            if (!tempDb.Uncategorized) tempDb.Uncategorized = [];
            tempDb.Uncategorized.push({ title });
        }

        successCount++;
        await sleep(120);
    }

    Object.entries(tempDb).forEach(([genre, shows]) => {
        if (!showDatabase[genre]) showDatabase[genre] = [];
        shows.forEach(show => {
            const exists = showDatabase[genre].some(existing =>
                normalizeMovieTitleForMatch(getText(existing)) === normalizeMovieTitleForMatch(getText(show))
            );
            if (!exists) showDatabase[genre].push(show);
        });
    });

    localStorage.setItem('cinematic_show_raw_list', rawShows);
    refreshShowWheelsAfterLibraryChange();

    const skipMsg = skippedCount > 0 ? ` (${skippedCount} already in library)` : '';
    showImportStatus.textContent = `Added ${successCount} shows across ${Object.keys(tempDb).length} genres.${skipMsg}`;
    showImportStatus.style.color = "#10b981";
    processShowImportBtn.disabled = false;

    setTimeout(() => {
        showImportModal.classList.add('hidden');
        showImportStatus.textContent = "";
    }, 2200);
});

searchShowBtn.addEventListener('click', () => {
    showSearchModal.classList.remove('hidden');
    showSearchInput.value = "";
    showSearchResults.innerHTML = "";
    setTimeout(() => showSearchInput.focus(), 100);
});

closeShowSearchModal.addEventListener('click', () => showSearchModal.classList.add('hidden'));
showSearchInput.addEventListener('input', performShowSearch);

updateShowLibraryCount();
drawWheel(showGenreWheelCanvas, activeShowGenres.length > 0 ? activeShowGenres : ["?"]);
drawWheel(showWheelCanvas, ["?"]);
refreshAuthState().then(() => {
    setActivePage(localStorage.getItem('cinematic_active_tab') === 'shows' ? 'shows' : 'movies');
});
