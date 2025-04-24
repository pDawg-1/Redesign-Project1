// Declare global data variable
let data = [];
let countyData = [];
let geoData = [];

// Load the CSV and TopoJSON files
Promise.all([
    d3.json("counties-10m.json"),
    d3.csv("data.csv")
]).then(loadedData => {
    console.log("Data loading complete.");
    
    geoData = loadedData[0];
    countyData = loadedData[1];
    data = countyData; // Assign loaded data to global variable

    // Process the data
    data.forEach(d => {
        d.PovertyValue = +d.PovertyValue;
        d.MHI_value = +d.MHI_value;
        d.Foodstamp_Value = +d.Foodstamp_Value;
        d.Obesity_Value = +d.Obesity_Value;
        d.Physicalinactivity_Value = +d.Physicalinactivity_Value;
        d.unemployment_Value = +d.unemployment_Value;
    });

    console.log("Processed Data:", data);
    initializeDropdowns();
    updateCharts();
    initializeMap();
}).catch(error => {
    console.error("Error loading data:", error);
});
function createTooltip() {
    return d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "yellow")  // Dark background for better contrast
        .style("color", "black")       // White text color
        .style("border", "1px solid #ccc")
        .style("padding", "5px")
        .style("border-radius", "5px")
        .style("box-shadow", "0px 0px 5px rgba(0,0,0,0.3)")
        .style("pointer-events", "none");
}

function initializeDropdowns() {
    const dropdown1 = d3.select("#dropdown1");
    const dropdown2 = d3.select("#dropdown2");
    const dropdown3 = d3.select("#dropdown3");

    const columns = [
        "PovertyValue",
        "MHI_value",
        "Foodstamp_Value",
        "Obesity_Value",
        "Physicalinactivity_Value",
        "unemployment_Value"
    ];

    dropdown1.selectAll("option").remove();
    dropdown2.selectAll("option").remove();
    dropdown3.selectAll("option").remove();

    dropdown1.selectAll("option")
        .data(columns)
        .enter().append("option")
        .text(d => d)
        .attr("value", d => d);

    dropdown2.selectAll("option")
        .data(columns)
        .enter().append("option")
        .text(d => d)
        .attr("value", d => d);

    dropdown3.selectAll("option")
        .data(columns)
        .enter().append("option")
        .text(d => d)
        .attr("value", d => d);

    dropdown1.property("value", columns[0]);
    dropdown2.property("value", columns[1]);
    dropdown3.property("value", columns[0]);

    dropdown1.on("change", updateCharts);
    dropdown2.on("change", updateCharts);
    dropdown3.on("change", () => updateMap(dropdown3.node().value));
}

function updateCharts() {
    if (!data.length) {
        console.warn("Data is not yet loaded.");
        return;
    }

    let Attribute1 = d3.select("#dropdown1").node().value;
    let Attribute2 = d3.select("#dropdown2").node().value;

    console.log("Selected Attributes:", Attribute1, Attribute2);

    const filteredData = data.map(d => ({
        x: +d[Attribute1],
        y: +d[Attribute2],
        display_name: d.display_name  // Include display_name
    })).filter(d => !isNaN(d.x) && !isNaN(d.y));
    
    d3.select("#histogram1").selectAll("*").remove();
    d3.select("#histogram2").selectAll("*").remove();
    d3.select("#scatterplot").selectAll("*").remove();

    createHistogram(filteredData, "x", "#histogram1", Attribute1);
    createHistogram(filteredData, "y", "#histogram2", Attribute2);
    createScatterplot(filteredData, Attribute1, Attribute2);
}

function initializeMap() {
    let selectedAttribute = d3.select("#dropdown3").node().value;
    updateMap(selectedAttribute);
}

function updateMap(attribute) {
    let colorScale = updateColorScale(attribute);

    geoData.objects.counties.geometries.forEach(d => {
        let county = countyData.find(c => c.cnty_fips === d.id);
        if (county) {
            d.properties = { ...county };
        }
    });

    renderMap(colorScale, attribute);
}

function updateColorScale(attribute) {
    let values = countyData.map(d => +d[attribute]).filter(d => !isNaN(d));
    return d3.scaleSequential(d3.interpolateBlues).domain([d3.min(values), d3.max(values)]);
}

function renderMap(colorScale, attribute) {
    d3.select(".viz").html("");

    const width = 960, height = 600;
    const projection = d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    const svg = d3.select(".viz").append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("style", "border: 2px solid black;");

    const g = svg.append("g");

    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);

    const counties = topojson.feature(geoData, geoData.objects.counties);

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "yellow")
        .style("color", "black")
        .style("padding", "5px 10px")
        .style("border-radius", "5px")
        .style("visibility", "hidden")
        .style("pointer-events", "none");

    g.selectAll("path")
        .data(counties.features)
        .enter().append("path")
        .attr("d", path)
        .attr("fill", d => d.properties[attribute] ? colorScale(d.properties[attribute]) : "#ccc")
        .attr("stroke", "#333")
        .attr("stroke-width", 0.5)
        .on("mouseover", function (event, d) {
            d3.select(this).attr("stroke-width", 2);

            // Get county name (display_name) and attribute value
            const countyName = d.properties.display_name || "Unknown County";
            const attrValue = d.properties[attribute] || "N/A";

            // Show tooltip with county name and attribute
            tooltip.style("visibility", "visible")
                .html(`<strong>${countyName}</strong><br>${attribute}: ${attrValue}`);
        })
        .on("mousemove", function (event) {
            tooltip.style("top", `${event.pageY + 10}px`)
                .style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", function () {
            d3.select(this).attr("stroke-width", 0.5);
            tooltip.style("visibility", "hidden");
        });

    renderLegend(colorScale);
}

function renderLegend(colorScale) {
    d3.select("#legend").remove();

    const legendWidth = 300, legendHeight = 20;
    const legendSvg = d3.select(".viz")
        .append("svg")
        .attr("id", "legend")
        .attr("width", legendWidth)
        .attr("height", legendHeight);


    const defs = legendSvg.append("defs");
    const linearGradient = defs.append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "100%").attr("y2", "0%");

    const colorRange = d3.range(0, 1.1, 0.1).map(d =>
        colorScale(d3.min(colorScale.domain()) + d * (d3.max(colorScale.domain()) - d3.min(colorScale.domain())))
    );

    linearGradient.selectAll("stop")
        .data(colorRange)
        .enter().append("stop")
        .attr("offset", (d, i) => `${(i / (colorRange.length - 1)) * 100}%`)
        .attr("stop-color", d => d);

    legendSvg.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight - 10)
        .style("fill", "url(#legend-gradient)");

    const legendScale = d3.scaleLinear()
        .domain(colorScale.domain())
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale).ticks(5).tickFormat(d3.format(".2s"));

    legendSvg.append("g")
        .attr("transform", `translate(0, ${legendHeight - 18})`)
        .call(legendAxis);
}

function createHistogram(data, attribute, container, label) {
    let svg = d3.select(container)
        .attr("width", 600)
        .attr("height", 400).attr("style", "border: 2px solid black;")
        .append("g")
        .attr("transform", "translate(50, 20)");
        

    let width = 500;
    let height = 350;

    let x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[attribute])])
        .range([0, width]);

    let bins = d3.histogram()
        .domain(x.domain())
        .thresholds(x.ticks(20))
        (data.map(d => d[attribute]));

    let y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)])
        .range([height, 0]);

    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(x))
        

    svg.append("g")
        .call(d3.axisLeft(y));

    let tooltip = createTooltip();

    svg.selectAll("rect")
        .data(bins)
        .enter().append("rect")
        .attr("x", d => x(d.x0))
        .attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 1))
        .attr("y", d => y(d.length))
        .attr("height", d => height - y(d.length))
        .attr("fill", "steelblue")
        .on("mouseover", (event, d) => {
            tooltip.style("visibility", "visible")
                .text(`Count: ${d.length}`);
        })
        .on("mousemove", event => {
            tooltip.style("top", `${event.pageY + 10}px`)
                .style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"));
}

function createScatterplot(data, attrX, attrY) {
    let svg = d3.select("#scatterplot")
        .attr("width", 600)
        .attr("height", 400)
        .attr("style", "border: 2px solid black;")
        .append("g")
        .attr("transform", "translate(50, 20)");

    let width = 500;
    let height = 350;

    let x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.x))
        .range([0, width]);

    let y = d3.scaleLinear()
        .domain(d3.extent(data, d => d.y))
        .range([height, 0]);

    svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(x));

    svg.append("g")
        .call(d3.axisLeft(y));

    // Create tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "yellow")
        .style("color", "black")
        .style("padding", "5px 10px")
        .style("border-radius", "5px")
        .style("visibility", "hidden")
        .style("pointer-events", "none");

    svg.selectAll("circle")
        .data(data)
        .enter().append("circle")
        .attr("cx", d => x(d.x))
        .attr("cy", d => y(d.y))
        .attr("r", 4)
        .attr("fill", "orange")
        .on("mouseover", (event, d) => {
            tooltip.style("visibility", "visible")
                .html(`<strong>${d.display_name}</strong><br>${attrX}: ${d.x}<br>${attrY}: ${d.y}`);
        })
        .on("mousemove", event => {
            tooltip.style("top", `${event.pageY + 10}px`)
                .style("left", `${event.pageX + 10}px`);
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"));
}
