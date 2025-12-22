// Global Data Storage
let rawData = {};
let processedData = []; // Still useful?
let groupedData = {}; 

// State
let state = {
    selectedYear: 2023, // Default to a recent year
    selectedCircuit: 'all',
    selectedDriver: 'all'
};

// Dimensions - handled dynamically

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

async function loadData() {
    try {
        console.log("Loading data...");
        const [races, results, drivers, circuits, driverStandings, worldGeo] = await Promise.all([
            d3.csv('assets/data/races.csv'),
            d3.csv('assets/data/results.csv'),
            d3.csv('assets/data/drivers.csv'),
            d3.csv('assets/data/circuits.csv'),
            d3.csv('assets/data/driver_standings.csv'),
            d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        ]);

        rawData = { races, results, drivers, circuits, driverStandings, worldGeo };
        console.log("Data loaded:", rawData);

        // Pre-process core lookups
        rawData.raceMap = new Map(races.map(r => [r.raceId, r]));
        rawData.driverMap = new Map(drivers.map(d => [d.driverId, d]));
        rawData.circuitMap = new Map(circuits.map(c => [c.circuitId, c]));

        setupControls();
        updateDashboard(true);

    } catch (error) {
        console.error("Error loading data:", error);
    }
}

function setupControls() {
    // Circuit Select
    const circuitSelect = d3.select("#circuitSelect");
    circuitSelect.on("change", function() {
        state.selectedCircuit = this.value;
        updateDashboard();
    });

    // Driver Select
    const driverSelect = d3.select("#driverSelect");
    driverSelect.on("change", function() {
        state.selectedDriver = this.value;
        updateDashboard();
    });

    // Populate Year Select
    const yearContainer = d3.select("#yearContainer").node();
    yearContainer.innerHTML = ''; 

    const yearLabel = d3.create("label")
        .style("color", "var(--text-secondary)")
        .style("font-weight", "bold")
        .style("margin-right", "1rem")
        .text("SEASON: ");
    
    const yearSelect = d3.create("select")
        .attr("id", "yearSelect");
        // Styles are now handled by CSS 'select' rule

    // Get available years from races
    const years = Array.from(new Set(rawData.races.map(r => parseInt(r.year))))
        .filter(y => y >= 2010 && y <= 2025) // Ensure constraint
        .sort((a,b) => b-a);
    
    years.forEach(y => {
        yearSelect.append("option").attr("value", y).text(y);
    });

    yearSelect.on("change", function() {
        state.selectedYear = parseInt(this.value);
        // Reset filters when year changes
        state.selectedCircuit = 'all'; 
        state.selectedDriver = 'all';
        updateDashboard(true); // Pass flag to update lists
    });

    yearContainer.appendChild(yearLabel.node());
    yearContainer.appendChild(yearSelect.node());

    // Reset Button
    d3.select("#resetBtn").on("click", () => {
        state.selectedCircuit = 'all';
        state.selectedDriver = 'all';
        // Reset dropdowns UI
        d3.select("#circuitSelect").property("value", "all");
        d3.select("#driverSelect").property("value", "all");
        updateDashboard();
    });

    // Setup Info Icon Tooltips
    d3.selectAll(".info-icon").each(function() {
        const icon = d3.select(this);
        const titleText = icon.attr("title");
        
        if (titleText) {
            icon.attr("data-title", titleText) // Backup content
                .attr("title", null) // Remove native tooltip
                .style("cursor", "help")
                .on("mouseover", (e) => {
                    showTooltip(e, titleText);
                })
                .on("mouseout", hideTooltip);
        }
    });
}

function updateCircuitDropdown(races) {
    const circuitSelect = d3.select("#circuitSelect");
    circuitSelect.html('<option value="all">All Circuits</option>');
    
    const circuits = Array.from(new Set(races.map(r => r.circuitId)))
        .map(id => {
            const c = rawData.circuitMap.get(id);
            return c ? { id: id, name: c.name } : null;
        })
        .filter(c => c)
        .sort((a,b) => a.name.localeCompare(b.name));

    circuits.forEach(c => {
        circuitSelect.append("option").attr("value", c.id).text(c.name);
    });
    
    circuitSelect.property("value", state.selectedCircuit);
}

function updateDriverDropdown(results) {
    const driverSelect = d3.select("#driverSelect");
    driverSelect.html('<option value="all">All Drivers</option>');

    const drivers = Array.from(new Set(results.map(r => r.driverId)))
        .map(id => {
            const d = rawData.driverMap.get(id);
            return d ? { id: id, name: `${d.forename} ${d.surname}` } : null;
        })
        .filter(d => d)
        .sort((a,b) => a.name.localeCompare(b.name));
    
    drivers.forEach(d => {
        driverSelect.append("option").attr("value", d.id).text(d.name);
    });

    driverSelect.property("value", state.selectedDriver);
}

function updateDashboard(yearChanged = false) {
    const year = state.selectedYear;
    console.log("Updating dashboard for year:", year);

    // Filter Races & Results for Year
    const racesOfYear = rawData.races.filter(r => parseInt(r.year) === year);
    console.log("Races of Year:", racesOfYear.length, "Sample RaceId:", racesOfYear[0]?.raceId);
    
    const raceIds = new Set(racesOfYear.map(r => r.raceId));
    
    // DEBUG: Check types
    if (racesOfYear.length > 0) {
        console.log("Type of raceId in Races:", typeof racesOfYear[0].raceId);
        console.log("Type of raceId in Results (sample):", typeof rawData.results[0].raceId);
    }

    let resultsOfYear = rawData.results.filter(r => raceIds.has(r.raceId));
    console.log("Results of Year (Filtered):", resultsOfYear.length);

    // Update Dropdowns if needed
    if (yearChanged) {
        updateCircuitDropdown(racesOfYear);
        updateDriverDropdown(resultsOfYear);
    }
    
    // Filter by Circuit
    let filteredResults = resultsOfYear;
    if (state.selectedCircuit !== 'all') {
        const circuitRaceIds = new Set(racesOfYear.filter(r => r.circuitId === state.selectedCircuit).map(r => r.raceId));
        filteredResults = resultsOfYear.filter(r => circuitRaceIds.has(r.raceId));
    }

    // Filter by Driver
    // For Analytics Charts, we usually want to see the "Season Context" for ALL drivers,
    // and just HIGHLIGHT the selected driver.
    // So we pass 'resultsOfYear' (Season Data) to charts, and 'state.selectedDriver' is used inside them for highlighting.
    // We only filter if we had specific lists that needed to hide others.
    
    // 1. World Map (Context: Season)
    try {
        drawWorldMap(racesOfYear, resultsOfYear, state.selectedDriver, state.selectedCircuit); 
    } catch (e) {
        console.error("Error drawing map:", e);
    }

    // 2. Driver Standings (Context: Season or Specific Race Standings)
    try {
        drawDriverStandings(year, racesOfYear, state.selectedDriver, state.selectedCircuit);
    } catch (e) {
        console.error("Error drawing standings:", e);
    }

    // 3. Analytics Charts (Context: Season)
    // Use setTimeout to ensure Grid/Flex layout has computed dimensions
    setTimeout(() => {
        try {
            // Ensure we pass full season data, independent of circuit filter
            const fullSeasonResults = rawData.results.filter(r => raceIds.has(r.raceId));
            if (fullSeasonResults.length === 0) {
                console.warn("No results data available for analytics.");
            }
            drawAnalytics(year, racesOfYear, fullSeasonResults, state.selectedCircuit);
        } catch (e) {
            console.error("Error drawing analytics:", e);
        }
    }, 0);
}

// --- VISUALIZATIONS ---

function drawWorldMap(races, results, selectedDriverId, selectedCircuitId) {
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
    // Strategy: Always show ALL races for geographical context.
    // If a driver is selected, highlight where they scored points vs where they didn't.
    
    // Identify which races the driver scored in
    const scoringRaceIds = new Set();
    if (selectedDriverId !== 'all') {
         results.filter(r => r.driverId === selectedDriverId && parseFloat(r.points) > 0)
                .forEach(r => scoringRaceIds.add(r.raceId));
    }

    // Filter unique circuits for this year
    const circuits = Array.from(new Set(races.map(r => r.circuitId)))
        .map(id => rawData.circuitMap.get(id))
        .filter(c => c);

    svg.append("g")
        .selectAll("circle")
        .data(circuits)
        .enter().append("circle")
        .attr("class", "circuit-point")
        .attr("cx", d => projection([d.lng, d.lat])[0])
        .attr("cy", d => projection([d.lng, d.lat])[1])
        .attr("r", d => d.circuitId === selectedCircuitId ? 8 : 4)
        .attr("fill", d => {
            if (d.circuitId === selectedCircuitId) return "#387DFF"; // Selected Circuit
            if (selectedDriverId === 'all') return "var(--f1-red)"; // Default
            
            // Driver Context
            const race = races.find(r => r.circuitId === d.circuitId);
            if (race && scoringRaceIds.has(race.raceId)) {
                return "var(--f1-red)"; // Scored
            }
            return "#444"; // Didn't Score (Grey)
        })
        .attr("opacity", d => {
            if (d.circuitId === selectedCircuitId) return 1;
            if (selectedCircuitId !== 'all') return 0.3; // Dim others if circuit selected
            
            // Driver Context: Keep Scored bright, dim non-scored slightly
            if (selectedDriverId !== 'all') {
                const race = races.find(r => r.circuitId === d.circuitId);
                if (race && scoringRaceIds.has(race.raceId)) return 1;
                return 0.2; // Very faint for no-points
            }
            return 1;
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
             const newSelect = d.circuitId === state.selectedCircuit ? 'all' : d.circuitId;
             d3.select("#circuitSelect").property("value", newSelect).dispatch("change");
        })
        .on("mouseover", (event, d) => {
            let content = `<strong>${d.name}</strong><br>${d.location}, ${d.country}`;
            
            if (selectedDriverId !== 'all') {
                const race = races.find(r => r.circuitId === d.circuitId);
                if (race) {
                    const res = results.find(r => r.raceId === race.raceId && r.driverId === selectedDriverId);
                    if (res) {
                        const scored = parseFloat(res.points) > 0;
                        const statusColor = scored ? "#00D2BE" : "#E10600"; // Green/Red indicator text
                        
                        content += `<div style="margin-top: 5px; border-top: 1px solid #555; paddingTop: 5px;">
                            <strong>${rawData.driverMap.get(selectedDriverId).code} Result:</strong><br>
                            Position: <span style="color:#fff">${res.positionOrder}</span><br>
                            Points: <span style="color:${statusColor}">${res.points}</span><br>
                        </div>`;
                    }
                }
            }
            showTooltip(event, content);
        })
        .on("mouseout", hideTooltip);

    // Legend
    const legend = svg.append("g")
        .attr("transform", `translate(20, ${height - 20})`);

    legend.append("circle").attr("r", 4).attr("fill", "var(--f1-red)").attr("stroke", "#fff");
    
    // Dynamic Legend Text
    let legendText = "Grand Prix Location";
    if (selectedDriverId !== 'all') {
        legendText = "Points Scored";
        
        // Add "No Points" entry
        legend.append("circle")
            .attr("r", 4)
            .attr("cx", 0)
            .attr("cy", -15)
            .attr("fill", "#444")
            .attr("stroke", "#fff")
            .attr("stroke", "#fff")
            .attr("opacity", 0.2); // Match map opacity
        legend.append("text").attr("x", 10).attr("y", -11).text("No Points").style("font-size", "12px").style("fill", "var(--text-secondary)");
    }

    legend.append("text")
        .attr("x", 10)
        .attr("y", 4)
        .text(legendText)
        .style("font-size", "12px")
        .style("fill", "var(--text-secondary)");
}

function drawDriverStandings(year, races, selectedDriverId, selectedCircuitId) {
    const container = d3.select("#driverStandings");
    container.html("");

    // Determine which race to show standings for
    let targetRace = null;

    if (selectedCircuitId !== 'all') {
        // If circuit filtered -> Show standings AFTER that race
        // (If multiple races at circuit, take the last one)
        const circuitRaces = races.filter(r => r.circuitId === selectedCircuitId)
                                  .sort((a,b) => parseInt(a.round) - parseInt(b.round));
        targetRace = circuitRaces.pop();
    } else {
        // If no filter -> Show standings AFTER layout race of year (Final Standings)
        // CRITICAL: process a COPY of races to avoid mutating the original array passed by reference
        targetRace = [...races].sort((a,b) => parseInt(a.round) - parseInt(b.round)).pop();
    }
    
    if (!targetRace) return;

    const standings = rawData.driverStandings
        .filter(s => s.raceId === targetRace.raceId)
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
        const isSelected = s.driverId === selectedDriverId;
        const row = tbody.append("tr")
            .style("background-color", isSelected ? "rgba(56, 125, 255, 0.2)" : null) // Highlight blue
            .style("border-left", isSelected ? "3px solid #387DFF" : "3px solid transparent")
            .style("font-weight", isSelected ? "bold" : "normal")
            .style("cursor", "pointer")
            .on("click", () => {
                 const newDriver = state.selectedDriver === s.driverId ? 'all' : s.driverId;
                 d3.select("#driverSelect").property("value", newDriver).dispatch("change");
            });
            
        row.append("td").text(s.position);
        row.append("td").text(`${driver.forename} ${driver.surname}`);
        row.append("td").text(s.points);
        row.append("td").text(s.wins);
        
        // Auto-scroll to selected driver
        if (isSelected) {
            row.node().scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
}

function drawAnalytics(year, races, results, selectedCircuitId) {
    // Shared data prep
    // CRITICAL: use copy to avoid mutating source
    const sortedRaces = [...races].sort((a,b) => parseInt(a.round) - parseInt(b.round));
    
    drawTrajectory(sortedRaces, results, selectedCircuitId);
    drawPerformanceMatrix(sortedRaces, results);
}

function drawTrajectory(races, results, selectedCircuitId) {
    console.log("drawTrajectory called", { racesCount: races.length, resultsCount: results.length });
    const container = d3.select("#trajectoryChart");
    container.html("");
    
    const margin = {top: 20, right: 30, bottom: 40, left: 40};
    const rect = container.node().getBoundingClientRect();
    console.log("Trajectory Container Rect:", rect);
    
    const width = rect.width - margin.left - margin.right;
    const height = rect.height - margin.top - margin.bottom;
    
    if (width <= 0 || height <= 0) {
        console.warn("Chart container too small", width, height);
        return;
    }

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Data Processing: Cumulative Points
    const driverPoints = new Map(); // driverId -> [{round, points}]
    
    // Sort results by race round
    // Need a quick lookup for race round
    const raceRoundMap = new Map();
    races.forEach(r => raceRoundMap.set(r.raceId, parseInt(r.round)));
    
    // Group results per driver
    const driverResults = d3.group(results, d => d.driverId);
    
    const rounds = races.map(r => parseInt(r.round)).sort((a,b) => a-b);
    const maxRound = d3.max(rounds);
    
    const dataset = [];

    for (const [driverId, feats] of driverResults) {
        let currentPoints = 0;
        const pointsHistory = [];
        
        // Ensure we have data for every round (cumulative)
        // Sort driver feats by round
        const drSorted = feats.sort((a,b) => raceRoundMap.get(a.raceId) - raceRoundMap.get(b.raceId));
        
        let featParams = 0;
        
        rounds.forEach(rnd => {
            // Find result for this round
            const res = drSorted.find(r => raceRoundMap.get(r.raceId) === rnd);
            if (res) {
                currentPoints += parseFloat(res.points);
            }
            pointsHistory.push({ round: rnd, points: currentPoints });
        });
        
        dataset.push({
            driverId: driverId,
            driverName: rawData.driverMap.get(driverId).code,
            history: pointsHistory,
            total: currentPoints
        });
    }

    // Filter: Top 3 + Selected
    const topDrivers = dataset.sort((a,b) => b.total - a.total).slice(0, 3);
    const topIds = new Set(topDrivers.map(d => d.driverId));
    
    // Always include selected driver if they exist
    if (state.selectedDriver !== 'all' && !topIds.has(state.selectedDriver)) {
        const selectedD = dataset.find(d => d.driverId === state.selectedDriver);
        if (selectedD) topDrivers.push(selectedD);
    }

    // Scales
    const x = d3.scaleLinear()
        .domain([1, maxRound])
        .range([0, width]);
        
    const y = d3.scaleLinear()
        .domain([0, d3.max(topDrivers, d => d.total)])
        .range([height, 0]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(maxRound).tickFormat(d3.format("d")))
        .style("color", "#666");

    svg.append("g")
        .call(d3.axisLeft(y).ticks(5))
        .style("color", "#666");

    // Gridlines (Y)
    svg.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(""))
        .style("stroke-opacity", 0.1);

    // Interaction Zones (Clickable Columns for Every Round)
    const step = maxRound > 1 ? x(2) - x(1) : width;
    
    svg.selectAll(".interaction-bar")
        .data(races)
        .enter()
        .append("rect")
        .attr("x", d => x(d.round) - (step / 2))
        .attr("y", 0)
        .attr("width", step)
        .attr("height", height)
        .attr("fill", "#FFF")
        .attr("opacity", 0) // Invisible by default
        .style("cursor", "pointer")
        .on("mouseover", function(e, d) {
            d3.select(this).attr("opacity", 0.1); // Highlight on hover
            const circuit = rawData.circuitMap.get(d.circuitId);
            showTooltip(e, `<strong>Round ${d.round}</strong><br>${circuit.name}`);
        })
        .on("mouseout", function() {
            d3.select(this).attr("opacity", 0);
            hideTooltip();
        })
        .on("click", (e, d) => {
            const newSelect = d.circuitId === selectedCircuitId ? 'all' : d.circuitId;
            d3.select("#circuitSelect").property("value", newSelect).dispatch("change");
        });

    // Highlight Selected Circuit Round
    if (selectedCircuitId && selectedCircuitId !== 'all') {
        const matchingRaces = races.filter(r => r.circuitId === selectedCircuitId);
        // Usually only 1, but handles multiple matches if needed
        const step = maxRound > 1 ? x(2) - x(1) : width;
        
        svg.selectAll(".highlight-bar")
            .data(matchingRaces)
            .enter()
            .append("rect")
            .attr("x", d => x(d.round) - (step / 2))
            .attr("y", 0)
            .attr("width", step)
            .attr("height", height)
            .attr("fill", "#E10600") // Red highlight
            .attr("opacity", 0.15)
            .style("pointer-events", "none");
    }

    // Axis Labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .style("text-anchor", "middle")
        .style("fill", "#888")
        .style("font-size", "10px")
        .text("Race Round");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -30)
        .style("text-anchor", "middle")
        .style("fill", "#888")
        .style("font-size", "10px")
        .text("Total Points");

    // Line Generator
    const line = d3.line()
        .x(d => x(d.round))
        .y(d => y(d.points))
        .curve(d3.curveMonotoneX);

    // Draw Lines
    svg.selectAll(".line")
        .data(topDrivers)
        .enter()
        .append("path")
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke", d => d.driverId === state.selectedDriver ? "#387DFF" : (topIds.has(d.driverId) ? "var(--text-secondary)" : "#444")) // Blue for selected, grey for others
        .attr("stroke-width", d => d.driverId === state.selectedDriver ? 3 : 1.5)
        .attr("stroke-opacity", d => d.driverId === state.selectedDriver ? 1 : 0.6)
        .attr("d", d => line(d.history));

    // Draw Dots for every point (shows even if only 1 race)
     svg.selectAll(".dot-group")
        .data(topDrivers)
        .enter()
        .append("g")
        .attr("class", "dot-group")
        .selectAll(".point-dot")
        .data(d => d.history.map(h => ({...h, driverId: d.driverId}))) // Pass driverId
        .enter()
        .append("circle")
        .attr("cx", d => x(d.round))
        .attr("cy", d => y(d.points))
        .attr("r", 3)
        .attr("fill", d => d.driverId === state.selectedDriver ? "#387DFF" : "#444")
        .attr("opacity", d => d.driverId === state.selectedDriver ? 1 : 0); // Only show dots for selected driver (or all if we want, but clutter)

    // Labels at end of line
    svg.selectAll(".label")
        .data(topDrivers)
        .enter()
        .append("text")
        .attr("x", width + 5)
        .attr("y", d => y(d.total))
        .attr("dy", "0.3em")
        .style("fill", d => d.driverId === state.selectedDriver ? "#387DFF" : "#888")
        .style("font-size", "10px")
        .text(d => d.driverName);
}

function drawPerformanceMatrix(races, results) {
    console.log("drawPerformanceMatrix called", { 
        mode: getMatrixMode(),
        races: races.length, 
        results: results.length 
    });

    const container = d3.select("#performanceMatrix");
    container.html("");
    
    // Determine which view to show
    const mode = getMatrixMode();

    if (mode === 'DRIVER_CIRCUIT') {
        renderCircuitGrid(races, results, state.selectedCircuit, state.selectedDriver);
    } else if (mode === 'CIRCUIT') {
        renderCircuitGrid(races, results, state.selectedCircuit);
    } else if (mode === 'DRIVER') {
        renderDriverSeasonDelta(races, results, state.selectedDriver);
    } else {
        renderSeasonScatter(results); // Default
    }
}

function getMatrixMode() {
    if (state.selectedDriver !== 'all' && state.selectedCircuit !== 'all') return 'DRIVER_CIRCUIT';
    if (state.selectedCircuit !== 'all') return 'CIRCUIT';
    if (state.selectedDriver !== 'all') return 'DRIVER';
    return 'SEASON';
}

// --- VIEW 1: DEFAULT SEASON SCATTER ---
function renderSeasonScatter(results) {
    const container = d3.select("#performanceMatrix");
    const margin = {top: 20, right: 20, bottom: 40, left: 40};
    const rect = container.node().getBoundingClientRect();
    const width = rect.width - margin.left - margin.right;
    const height = rect.height - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Data Processing
    const driverStats = d3.rollups(results, v => {
        const validGrid = v.filter(d => parseInt(d.grid) > 0);
        const validPos = v.filter(d => parseInt(d.positionOrder) > 0);
        
        return {
            avgGrid: d3.mean(validGrid, d => parseInt(d.grid)) || 20,
            avgFinish: d3.mean(validPos, d => parseInt(d.positionOrder)) || 20,
            count: v.length,
            driverId: v[0].driverId
        };
    }, d => d.driverId)
    .map(d => d[1])
    .filter(d => d.count >= 1);

    const maxVal = Math.max(20, d3.max(driverStats, d => Math.max(d.avgGrid, d.avgFinish)) || 20);
    
    const x = d3.scaleLinear().domain([maxVal + 1, 1]).range([0, width]);
    const y = d3.scaleLinear().domain([maxVal + 1, 1]).range([height, 0]);

    // Reference Line
    svg.append("line")
        .attr("x1", x(maxVal + 1)).attr("y1", y(maxVal + 1))
        .attr("x2", x(1)).attr("y2", y(1))
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,5")
        .attr("opacity", 0.8);

    svg.append("text")
        .attr("x", x(maxVal + 1)).attr("y", y(1) - 10)
        .style("fill", "#999")
        .style("font-size", "11px")
        .style("font-weight", "bold")
        .text("- - - Expected Performance");

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .style("color", "#666");
    
    svg.append("text")
        .attr("x", width / 2).attr("y", height + 35)
        .style("text-anchor", "middle").style("fill", "#888")
        .style("font-size", "10px").text("Avg Starting Position (Grid)");

    svg.append("g")
        .call(d3.axisLeft(y)).style("color", "#666");
        
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2).attr("y", -30)
        .style("text-anchor", "middle").style("fill", "#888")
        .style("font-size", "10px").text("Avg Finishing Position");

    // Dots
    svg.selectAll(".dot")
        .data(driverStats)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.avgGrid))
        .attr("cy", d => y(d.avgFinish))
        .attr("r", d => d.driverId === state.selectedDriver ? 8 : 5)
        .attr("fill", d => d.driverId === state.selectedDriver ? "#387DFF" : (d.avgFinish < d.avgGrid ? "#00D2BE" : "#E10600"))
        .attr("opacity", d => d.driverId === state.selectedDriver ? 1 : 0.7)
        .attr("stroke", "#fff")
        .attr("stroke-width", d => d.driverId === state.selectedDriver ? 2 : 0)
        .style("cursor", "pointer")
        .on("click", (e, d) => {
             const newDriver = state.selectedDriver === d.driverId ? 'all' : d.driverId;
             d3.select("#driverSelect").property("value", newDriver).dispatch("change");
        })
        .on("mouseover", (e, d) => {
            const driver = rawData.driverMap.get(d.driverId);
            showTooltip(e, `
                <strong>${driver.forename} ${driver.surname}</strong><br>
                Avg Start: ${d.avgGrid.toFixed(1)}<br>
                Avg Finish: ${d.avgFinish.toFixed(1)}
            `);
        })
        .on("mouseout", hideTooltip);

    // Color Meaning Legend
    svg.append("circle").attr("cx", width - 80).attr("cy", height - 40).attr("r", 4).attr("fill", "#00D2BE");
    svg.append("text").attr("x", width - 70).attr("y", height - 40).attr("dy", "0.3em").style("fill", "#bbb").style("font-size", "10px").text("Gained Pos.");

    svg.append("circle").attr("cx", width - 80).attr("cy", height - 25).attr("r", 4).attr("fill", "#E10600");
    svg.append("text").attr("x", width - 70).attr("y", height - 25).attr("dy", "0.3em").style("fill", "#bbb").style("font-size", "10px").text("Lost Pos.");
}

// --- VIEW 2: CIRCUIT FILTER (GRID + ARROWS) ---
function renderCircuitGrid(races, results, circuitId, highlightDriverId = null) {
    const container = d3.select("#performanceMatrix");
    // Filter results just for this circuit in this year
    const race = races.find(r => r.circuitId === circuitId);
    if (!race) {
        container.html("<div style='padding:1rem; color:#888'>No race data for this circuit/year.</div>");
        return;
    }

    const circuitResults = results.filter(r => r.raceId === race.raceId)
        .sort((a,b) => parseInt(a.positionOrder) - parseInt(b.positionOrder));

    const table = container.append("div")
        .style("height", "100%")
        .style("overflow-y", "auto")
        .append("table")
        .attr("class", "f1-table perf-grid");

    const thead = table.append("thead").append("tr");
    thead.append("th").text("Driver");
    thead.append("th").text("Start");
    thead.append("th").text("Finish");
    thead.append("th").text("+/-");

    const tbody = table.append("tbody");

    circuitResults.forEach(r => {
        const driver = rawData.driverMap.get(r.driverId);
        const grid = parseInt(r.grid);
        const finish = parseInt(r.positionOrder);
        const diff = grid - finish; // Positive means gained positions (started 5, finished 3 => +2)

        const row = tbody.append("tr")
            .style("cursor", "pointer")
            .on("click", () => {
                 const newDriver = state.selectedDriver === r.driverId ? 'all' : r.driverId;
                 d3.select("#driverSelect").property("value", newDriver).dispatch("change");
            });

        // Highlight row if this is the selected driver
        if (highlightDriverId && r.driverId === highlightDriverId) {
            row.style("background-color", "rgba(56, 125, 255, 0.2)") // Semi-transparent blue
               .style("border-left", "3px solid #387DFF");
            
            // Auto-scroll to this row with animation
            setTimeout(() => {
                row.node().scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100); // Small delay to ensure render is complete
        }
        row.append("td").text(`${driver.forename} ${driver.surname}`);
        row.append("td").text(grid === 0 ? "Pit" : grid); // 0 usually means pit lane
        row.append("td").text(finish);
        
        const changeCell = row.append("td")
            .style("display", "flex")
            .style("align-items", "center")
            .style("justify-content", "center")
            .style("gap", "5px");
        
        if (diff > 0) {
            changeCell.style("color", "#00D2BE");
            changeCell.html(`<span class="arrow-up">▲</span> ${diff}`);
        } else if (diff < 0) {
            changeCell.style("color", "#E10600");
            changeCell.html(`<span class="arrow-down">▼</span> ${Math.abs(diff)}`);
        } else {
            changeCell.style("color", "#888");
            changeCell.html(`<span class="arrow-neutral">-</span>`);
        }
    });
}

// --- VIEW 3: DRIVER FILTER (DOT PLOT: Grid vs Finish) ---
function renderDriverSeasonDelta(races, results, driverId) {
    const container = d3.select("#performanceMatrix");
    const margin = {top: 20, right: 20, bottom: 40, left: 40};
    const rect = container.node().getBoundingClientRect();
    const width = rect.width - margin.left - margin.right;
    const height = rect.height - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Data Processing
    const driverResults = results.filter(r => r.driverId === driverId);
    
    // Process Data
    const raceRoundMap = new Map(races.map(r => [r.raceId, parseInt(r.round)]));
    const data = driverResults.map(r => {
        let grid = parseInt(r.grid);
        if (grid === 0) grid = 20; // Treat pit lane start as back of grid for viz
        
        const finish = parseInt(r.positionOrder);
        return {
            round: raceRoundMap.get(r.raceId),
            grid: grid,
            finish: finish,
            diff: grid - finish, // +ve is good
            raceId: r.raceId
        };
    }).sort((a,b) => a.round - b.round);

    const rounds = races.map(r => parseInt(r.round)).sort((a,b) => a-b);
    
    // Scales
    const x = d3.scalePoint()
        .domain(rounds)
        .range([0, width])
        .padding(0.5);

    const y = d3.scaleLinear()
        .domain([20, 1]) // 20 at bottom, 1 at top
        .range([height, 0]);

    // Gridlines
    svg.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat(""))
        .style("stroke-opacity", 0.1);

    // Connector Lines (The "Stick" of the lollipop)
    svg.selectAll(".connector")
        .data(data)
        .enter().append("line")
        .attr("x1", d => x(d.round))
        .attr("x2", d => x(d.round))
        .attr("y1", d => y(d.grid))
        .attr("y2", d => y(d.finish))
        .attr("stroke", d => d.diff > 0 ? "#00D2BE" : (d.diff < 0 ? "#E10600" : "#888"))
        .attr("stroke-width", 2)
        .attr("opacity", 0.8);

    // Start Dots (Grid)
    svg.selectAll(".dot-start")
        .data(data)
        .enter().append("circle")
        .attr("cx", d => x(d.round))
        .attr("cy", d => y(d.grid))
        .attr("r", 3)
        .attr("fill", "#222") // Dark center
        .attr("stroke", "#888") // Grey ring
        .attr("stroke-width", 1.5)
        .on("mouseover", (e, d) => showTooltip(e, `Start: P${d.grid}`))
        .on("mouseout", hideTooltip);

    // Finish Dots (Position)
    svg.selectAll(".dot-finish")
        .data(data)
        .enter().append("circle")
        .attr("cx", d => x(d.round))
        .attr("cy", d => y(d.finish))
        .attr("r", 5)
        .attr("fill", d => d.diff > 0 ? "#00D2BE" : (d.diff < 0 ? "#E10600" : "#888"))
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
         .on("mouseover", (e, d) => {
            const race = races.find(r => r.raceId === d.raceId);
            const circuit = rawData.circuitMap.get(race.circuitId);
            
            let gainLossText = "";
            if (d.diff > 0) gainLossText = `<span style="color:#00D2BE">▲ Gained ${d.diff}</span>`;
            else if (d.diff < 0) gainLossText = `<span style="color:#E10600">▼ Lost ${Math.abs(d.diff)}</span>`;
            else gainLossText = `<span style="color:#888">- Maintained</span>`;

            showTooltip(e, `
                <strong>${circuit.name}</strong><br>
                Start: P${d.grid} → Finish: P${d.finish}<br>
                ${gainLossText}
            `);
        })
        .on("mouseout", hideTooltip);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d => d)) 
        .style("color", "#666");

    svg.append("g")
        .call(d3.axisLeft(y).ticks(5))
        .style("color", "#666");

    svg.append("text")
        .attr("x", width / 2).attr("y", height + 35)
        .style("text-anchor", "middle").style("fill", "#888")
        .style("font-size", "10px").text("Race Round");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2).attr("y", -30)
        .style("text-anchor", "middle").style("fill", "#888")
        .style("font-size", "10px").text("Position (1st is Top)");

    // HTML Legend (Absolute Position)
    container.style("position", "relative"); // Ensure container is reference for absolute

    const legend = container.append("div")
        .style("position", "absolute")
        .style("bottom", "-10px")
        .style("right", "10px")

        .style("padding", "4px 8px")
        .style("border-radius", "4px")
        .style("display", "flex")
        .style("gap", "12px")
        .style("z-index", "10");

    // Start Item
    const startItem = legend.append("div").style("display", "flex").style("align-items", "center").style("gap", "4px");
    startItem.append("div").style("width", "8px").style("height", "8px").style("border", "1.5px solid #888").style("border-radius", "50%").style("background", "transparent");
    startItem.append("span").text("Start").style("color", "#aaa").style("font-size", "11px");

    // Gained Item
    const gainedItem = legend.append("div").style("display", "flex").style("align-items", "center").style("gap", "4px");
    gainedItem.append("div").style("width", "8px").style("height", "8px").style("background", "#00D2BE").style("border-radius", "50%");
    gainedItem.append("span").text("Gained").style("color", "#aaa").style("font-size", "11px");

    // Lost Item
    const lostItem = legend.append("div").style("display", "flex").style("align-items", "center").style("gap", "4px");
    lostItem.append("div").style("width", "8px").style("height", "8px").style("background", "#E10600").style("border-radius", "50%");
    lostItem.append("span").text("Lost").style("color", "#aaa").style("font-size", "11px");
}

// --- VIEW 4: DRIVER + CIRCUIT (HISTORICAL TIMELINE) ---
function renderDriverCircuitHistory(driverId, circuitId) {
    const container = d3.select("#performanceMatrix");
    const margin = {top: 20, right: 30, bottom: 40, left: 40};
    const rect = container.node().getBoundingClientRect();
    const width = rect.width - margin.left - margin.right;
    const height = rect.height - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Need to find ALL races at this circuit across ALL years
    // rawData.races contains all years
    const racesAtCircuit = rawData.races.filter(r => r.circuitId === circuitId);
    const raceIds = new Set(racesAtCircuit.map(r => r.raceId));
    
    // Find results for this driver in those races
    // rawData.results contains all years
    // BUT we might need to fetch full results first? 
    // Wait, rawData.results IS loaded fully in loadData? 
    // Checking loadData: d3.csv('assets/data/results.csv') -> It loads EVERYTHING. 
    // Yes, rawData.results has all history.
    
    const historyData = rawData.results
        .filter(r => r.driverId === driverId && raceIds.has(r.raceId))
        .map(r => {
            const race = racesAtCircuit.find(race => race.raceId === r.raceId);
            return {
                year: parseInt(race.year),
                grid: parseInt(r.grid),
                finish: parseInt(r.positionOrder)
            };
        })
        .sort((a,b) => a.year - b.year);

    if (historyData.length === 0) {
        container.html("<div style='padding:1rem; color:#888'>No historical data for this driver at this circuit.</div>");
        return;
    }

    const x = d3.scaleLinear()
        .domain(d3.extent(historyData, d => d.year))
        .range([0, width]);
        
    // Y-axis 1-20 (Inverted)
    const y = d3.scaleLinear()
        .domain([22, 1])
        .range([height, 0]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(historyData.length)) // Show all years if few
        .style("color", "#666");

    svg.append("g")
        .call(d3.axisLeft(y))
        .style("color", "#666");

    // Line (Finish Position)
    const line = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.finish));

    svg.append("path")
        .datum(historyData)
        .attr("fill", "none")
        .attr("stroke", "#387DFF")
        .attr("stroke-width", 2)
        .attr("d", line);

    // Dots
    svg.selectAll(".dot")
        .data(historyData)
        .enter().append("circle")
        .attr("cx", d => x(d.year))
        .attr("cy", d => y(d.finish))
        .attr("r", 4)
        .attr("fill", "#387DFF")
        .attr("stroke", "#fff")
        .on("mouseover", (e, d) => {
            showTooltip(e, `
                <strong>${d.year}</strong><br>
                Start: ${d.grid}<br>
                Finish: ${d.finish}
            `);
        })
        .on("mouseout", hideTooltip);

    // Title
    const driverName = rawData.driverMap.get(driverId).surname;
    const circuitName = rawData.circuitMap.get(circuitId).name;
    
    svg.append("text")
        .attr("x", width/2)
        .attr("y", -5)
        .style("text-anchor", "middle")
        .style("fill", "#eee")
        .style("font-size", "12px")
        .text(`${driverName} @ ${circuitName}: History`);
}

// Tooltip Helpers
const tooltip = d3.select("body").append("div")
    .attr("class", "d3-tooltip")
    .style("opacity", 0);

function showTooltip(event, html) {
    tooltip.transition()
        .duration(200)
        .style("opacity", .9);
    
    tooltip.html(html);

    // Get dimensions to prevent overflow
    const tooltipNode = tooltip.node();
    const tooltipRect = tooltipNode.getBoundingClientRect();
    const pageWidth = window.innerWidth;

    let left = event.pageX + 10;
    let top = event.pageY - 28;

    // Flip to left if it overflows right edge
    if (left + tooltipRect.width > pageWidth - 20) {
        left = event.pageX - tooltipRect.width - 10;
    }

    tooltip
        .style("left", left + "px")
        .style("top", top + "px");
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
