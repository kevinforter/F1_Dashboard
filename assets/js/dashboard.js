// Global Data Storage
let rawData = {};
let processedData = []; // Still useful? Maybe for specific race lookups
let groupedData = {}; 

// State
let state = {
    selectedYear: 2023, // Default to a recent year
    // selectedCircuit removed as primary filter for this view, maybe used for highlighting?
};

// Dimensions - handled dynamically

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

async function loadData() {
    try {
        console.log("Loading data...");
        const [races, results, drivers, circuits, driverStandings, pitStops, statusData, worldGeo] = await Promise.all([
            d3.csv('assets/data/races.csv'),
            d3.csv('assets/data/results.csv'),
            d3.csv('assets/data/drivers.csv'),
            d3.csv('assets/data/circuits.csv'),
            d3.csv('assets/data/driver_standings.csv'),
            d3.csv('assets/data/pit_stops.csv'),
            d3.csv('assets/data/status.csv'),
            d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        ]);

        rawData = { races, results, drivers, circuits, driverStandings, pitStops, statusData, worldGeo };
        console.log("Data loaded:", rawData);

        // Pre-process core lookups
        rawData.raceMap = new Map(races.map(r => [r.raceId, r]));
        rawData.driverMap = new Map(drivers.map(d => [d.driverId, d]));
        rawData.circuitMap = new Map(circuits.map(c => [c.circuitId, c]));
        rawData.statusMap = new Map(statusData.map(s => [s.statusId, s.status]));

        setupControls();
        updateDashboard();

    } catch (error) {
        console.error("Error loading data:", error);
    }
}

function setupControls() {
    // Year Select
    const yearContainer = d3.select("#yearLabel").node().parentNode.parentNode;
    yearContainer.innerHTML = ''; 

    const yearLabel = d3.create("label")
        .style("color", "var(--text-secondary)")
        .style("font-weight", "bold")
        .style("margin-right", "1rem")
        .text("SEASON: ");
    
    const yearSelect = d3.create("select")
        .attr("id", "yearSelect")
        .style("background", "var(--bg-dark)")
        .style("color", "var(--text-primary)")
        .style("border", "1px solid var(--border-color)")
        .style("padding", "0.5rem")
        .style("border-radius", "4px");

    // Get available years from races
    const years = Array.from(new Set(rawData.races.map(r => parseInt(r.year))))
        .filter(y => y >= 2010 && y <= 2023) // Ensure constraint
        .sort((a,b) => b-a);
    
    years.forEach(y => {
        yearSelect.append("option").attr("value", y).text(y);
    });

    yearSelect.on("change", function() {
        state.selectedYear = parseInt(this.value);
        updateDashboard();
    });

    yearContainer.appendChild(yearLabel.node());
    yearContainer.appendChild(yearSelect.node());

    // Hide Circuit Select (Not needed for this view overview)
    d3.select("#circuitSelect").node().parentNode.style.display = 'none';
}

function updateDashboard() {
    const year = state.selectedYear;
    console.log("Updating dashboard for year:", year);

    // Filter Data for Year
    const racesOfYear = rawData.races.filter(r => parseInt(r.year) === year);
    const raceIds = new Set(racesOfYear.map(r => r.raceId));

    // Data Subsets
    const resultsOfYear = rawData.results.filter(r => raceIds.has(r.raceId));
    // Pit stops linked to these races
    const pitsOfYear = rawData.pitStops ? rawData.pitStops.filter(p => raceIds.has(p.raceId)) : []; 

    // 1. World Map
    drawWorldMap(racesOfYear);

    // 2. Driver Standings
    drawDriverStandings(year, racesOfYear);

    // 3. Insight Lists
    drawInsights(resultsOfYear, pitsOfYear);
}

// --- VISUALIZATIONS ---

function drawWorldMap(races) {
    const container = d3.select("#worldMap");
    container.html(""); // Clear

    const width = container.node().getBoundingClientRect().width;
    const height = container.node().getBoundingClientRect().height || 400; // Fallback

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    // Projection
    const projection = d3.geoNaturalEarth1()
        .scale(width / 6) // Dynamic scale
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    // Draw Countries
    const countries = topojson.feature(rawData.worldGeo, rawData.worldGeo.objects.countries);
    
    svg.append("g")
        .selectAll("path")
        .data(countries.features)
        .enter().append("path")
        .attr("class", "country")
        .attr("d", path);

    // Draw Circuits
    // Filter unique circuits for this year
    const circuits = Array.from(new Set(races.map(r => r.circuitId)))
        .map(id => rawData.circuitMap.get(id))
        .filter(c => c); // Ensure exists

    svg.append("g")
        .selectAll("circle")
        .data(circuits)
        .enter().append("circle")
        .attr("class", "circuit-point")
        .attr("cx", d => projection([d.lng, d.lat])[0])
        .attr("cy", d => projection([d.lng, d.lat])[1])
        .attr("r", 4)
        .on("mouseover", (event, d) => {
            showTooltip(event, `<strong>${d.name}</strong><br>${d.location}, ${d.country}`);
        })
        .on("mouseout", hideTooltip);
}

function drawDriverStandings(year, races) {
    const container = d3.select("#driverStandings");
    container.html("");

    // Logic: Get standings from the LAST race of the year
    // Sort races by round/date
    const lastRace = races.sort((a,b) => parseInt(a.round) - parseInt(b.round)).pop();
    
    if (!lastRace) return;

    // Get standings for that race
    const standings = rawData.driverStandings
        .filter(s => s.raceId === lastRace.raceId)
        .sort((a,b) => parseInt(a.position) - parseInt(b.position));

    const table = container.append("table").attr("class", "f1-table");
    
    const thead = table.append("thead").append("tr");
    thead.append("th").text("Pos");
    thead.append("th").text("Driver");
    thead.append("th").text("Points");
    thead.append("th").text("Wins");

    const tbody = table.append("tbody");
    
    standings.forEach(s => {
        const driver = rawData.driverMap.get(s.driverId);
        const row = tbody.append("tr");
        row.append("td").text(s.position);
        row.append("td").text(`${driver.forename} ${driver.surname}`);
        row.append("td").text(s.points);
        row.append("td").text(s.wins);
    });
}

function drawInsights(results, pits) {
    // 1. Top Overtakers (Grid - Pos)
    // Aggregate by Driver across all races in year
    const driverStats = new Map();

    results.forEach(r => {
        if (!driverStats.has(r.driverId)) {
            driverStats.set(r.driverId, { 
                id: r.driverId, 
                gained: 0, 
                lost: 0, 
                crashes: 0, 
                fastestLapCount: 0,
                fastestLapSpeeds: [] 
            });
        }
        const stats = driverStats.get(r.driverId);
        
        // Overtakes / Lost
        const grid = parseInt(r.grid);
        const pos = parseInt(r.positionOrder);
        
        if (grid > 0) { // Only count if valid grid
            const diff = grid - pos;
            if (diff > 0) stats.gained += diff;
            if (diff < 0) stats.lost += Math.abs(diff);
        }

        // Crashes (Status 3, 4, maybe others? 'Collision', 'Accident', 'Spun off')
        // Status ID 3=Accident, 4=Collision, 20=Spun off, 104=Fatal accident
        const crashIds = ["3", "4", "20", "104"]; 
        // Simple check
        if (crashIds.includes(r.statusId)) {
            stats.crashes++;
        }

        // Fastest Lap
        if (r.rank === "1") {
            stats.fastestLapCount++;
        }
        // Speed for raw comparison? 
        // Actually, "Fastest Laps" list requested...
        // Maybe list of TOP SPEED races? Or Driver with MOST fastest laps?
        // Let's do "Most Fastest Laps" or "Fastest Lap of Season"
        // Let's list individual fastest laps for the season (Top 10 Fastest Laps by avg speed)
    });

    const statsArray = Array.from(driverStats.values());

    // --- Helper to draw simple list ---
    function drawSimpleList(selector, data, columns) {
        const div = d3.select(selector);
        div.html("");
        const table = div.append("table").attr("class", "f1-table");
        
        // Header
        const thead = table.append("thead").append("tr");
        columns.forEach(c => thead.append("th").text(c.label));
        
        const tbody = table.append("tbody");
        data.forEach(d => {
            const tr = tbody.append("tr");
            columns.forEach(c => tr.append("td").text(c.value(d)));
        });
    }

    // List 1: Top Overtakers
    const topOvertakers = [...statsArray].sort((a,b) => b.gained - a.gained).slice(0, 10);
    drawSimpleList("#listOvertakers", topOvertakers, [
        { label: "Driver", value: d => rawData.driverMap.get(d.id).surname },
        { label: "Pos Gained", value: d => d.gained }
    ]);

    // List 2: Fastest Laps (Individual, Top Speed)
    // Need to parse speeds from results where rank=1
    const fastLaps = results
        .filter(r => r.fastestLapSpeed && r.fastestLapSpeed !== "\\N")
        .map(r => ({
            driverId: r.driverId,
            raceId: r.raceId,
            speed: parseFloat(r.fastestLapSpeed),
            time: r.fastestLapTime
        }))
        .sort((a,b) => b.speed - a.speed)
        .slice(0, 10);

    drawSimpleList("#listFastestLap", fastLaps, [
        { label: "Driver", value: d => rawData.driverMap.get(d.driverId).code },
        { label: "Race", value: d => rawData.raceMap.get(d.raceId).name.replace(" Grand Prix", "") },
        { label: "Speed (km/h)", value: d => d.speed }
    ]);

    // List 3: Most Crashes (Moved up)
    const topCrashes = [...statsArray].sort((a,b) => b.crashes - a.crashes).slice(0, 10);
     drawSimpleList("#listCrashes", topCrashes, [
        { label: "Driver", value: d => rawData.driverMap.get(d.id).surname },
        { label: "Crashes", value: d => d.crashes }
    ]);

    // List 5: Positions Lost
    const topLost = [...statsArray].sort((a,b) => b.lost - a.lost).slice(0, 10);
    drawSimpleList("#listPositionsLost", topLost, [
        { label: "Driver", value: d => rawData.driverMap.get(d.id).surname },
        { label: "Pos Lost", value: d => d.lost }
    ]);
}

// Tooltip Helpers
const tooltip = d3.select("body").append("div")
    .attr("class", "d3-tooltip")
    .style("opacity", 0);

function showTooltip(event, html) {
    tooltip.transition()
        .duration(200)
        .style("opacity", .9);
    tooltip.html(html)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
}

function hideTooltip() {
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
}

// TopoJSON library is needed for the map, loading via CDN or assuming global variable if loaded in HTML
// I will dynamically add the script tag if not present, OR the user might need to add it to HTML.
// Better to add to dashboard.html head.
// For now, I'll rely on global `topojson` being available if I add script to HTML.
