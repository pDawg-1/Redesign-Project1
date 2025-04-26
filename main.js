// Global data and brush tracker
let data = [], countyData = [], geoData = [];
let activeBrush = null;
let currentFilter = null;

// Load CSV and TopoJSON files
Promise.all([
    d3.json("counties-10m.json"),
    d3.csv("data.csv")
]).then(loadedData => {
    geoData = loadedData[0];
    countyData = loadedData[1];
    data = countyData;

    data.forEach(d => {
        d.Poverty_Value = +d.Poverty_Value;
        d.MHI_value = +d.MHI_value;
        d.Food_Stamp_Value = +d.Food_Stamp_Value;
        d.Obesity_Value = +d.Obesity_Value;
        d.Physical_Inactivity_Value = +d.Physical_Inactivity_Value;
        d.Unemployment_Value = +d.Unemployment_Value;
    });

    initializeDropdowns();
    updateCharts();
    initializeMap();
}).catch(console.error);

function initializeDropdowns() {
    const cols = [
        "Poverty_Value", "MHI_value", "Food_Stamp_Value",
        "Obesity_Value", "Physical_Inactivity_Value", "Unemployment_Value"
    ];
    d3.selectAll("#dropdown1, #dropdown2, #dropdown3")
        .selectAll("option")
        .data(cols)
        .enter().append("option")
        .text(d => d.replace(/_/g, " "))
        .attr("value", d => d);

    d3.select("#dropdown1").property("value", cols[0]);
    d3.select("#dropdown2").property("value", cols[1]);
    d3.select("#dropdown3").property("value", cols[0]);

    d3.select("#dropdown1").on("change", updateCharts);
    d3.select("#dropdown2").on("change", updateCharts);
    d3.select("#dropdown3").on("change", () => updateMap(d3.select("#dropdown3").node().value));
}

function updateCharts() {
    const attr1 = d3.select("#dropdown1").node().value;
    const attr2 = d3.select("#dropdown2").node().value;
    const filtered = data.map(d => ({
        x: +d[attr1], y: +d[attr2], display_name: d.display_name, id: d.cnty_fips,
        [attr1]: +d[attr1], [attr2]: +d[attr2]
    })).filter(d => !isNaN(d.x) && !isNaN(d.y));

    d3.select("#histogram1").selectAll("*").remove();
    d3.select("#histogram2").selectAll("*").remove();
    d3.select("#scatterplot").selectAll("*").remove();

    createHistogram(filtered, "x", "#histogram1", attr1);
    createHistogram(filtered, "y", "#histogram2", attr2);
    createScatterplot(filtered, attr1, attr2);
    drawRadarChart(filtered,attr1,attr2);
}

function initializeMap() {
    updateMap(d3.select("#dropdown3").node().value);
}

function updateMap(attribute) {
    const colorScale = updateColorScale(attribute);

    geoData.objects.counties.geometries.forEach(d => {
        const county = countyData.find(c => c.cnty_fips === d.id);
        if (county) d.properties = { ...county };
    });

    renderMap(colorScale, attribute, null);
}

function updateMapWithFilter(attribute, selectedIds) {
    const colorScale = updateColorScale(attribute);

    renderMap(colorScale, attribute, new Set(selectedIds));
}

function updateColorScale(attribute) {
    const values = countyData.map(d => +d[attribute]).filter(d => !isNaN(d));
    return d3.scaleLinear()
        .domain([d3.min(values), d3.max(values)])
        .range(["#c7d9e9", "#4682b4"]);
}

function renderMap(colorScale, attribute, selectedSet) {
    d3.select(".viz").html("");

    const width = 960, height = 600;
    const projection = d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);
    const svg = d3.select(".viz").append("svg")
        .attr("width", width).attr("height", height)
        .attr("style", "border: 2px solid black;");

    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([1, 8]).on("zoom", e => g.attr("transform", e.transform)));

    const counties = topojson.feature(geoData, geoData.objects.counties);
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip").style("position", "absolute")
        .style("background", "#dea3bf").style("color", "black")
        .style("padding", "5px 10px").style("border-radius", "5px")
        .style("visibility", "hidden").style("pointer-events", "none");

    g.selectAll("path").data(counties.features).enter().append("path")
        .attr("d", path)
        .attr("fill", d => {
            if (selectedSet && !selectedSet.has(d.id)) return "#eee";
            return d.properties[attribute] ? colorScale(d.properties[attribute]) : "#ccc";
        })
        .attr("stroke", "#333").attr("stroke-width", 0.5)
        .on("mouseover", function (event, d) {
            d3.select(this).attr("stroke-width", 2);
            tooltip.style("visibility", "visible")
                .html(`<strong>${d.properties.display_name}</strong><br>${attribute}: ${d.properties[attribute] || "N/A"}`);
        })
        .on("mousemove", e => tooltip.style("top", `${e.pageY + 10}px`).style("left", `${e.pageX + 10}px`))
        .on("mouseout", function () {
            d3.select(this).attr("stroke-width", 0.5);
            tooltip.style("visibility", "hidden");
        });

    renderLegend(colorScale);
}

function renderLegend(colorScale) {
    d3.select("#legend").remove();

    const legendWidth = 300, legendHeight = 20;
    const legendSvg = d3.select(".viz").append("svg")
        .attr("id", "legend").attr("width", legendWidth).attr("height", legendHeight);

    const defs = legendSvg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "legend-gradient").attr("x1", "0%").attr("x2", "100%");

    const domain = colorScale.domain();
    const colorRange = d3.range(0, 1.01, 0.1).map(d =>
        colorScale(domain[0] + d * (domain[1] - domain[0]))
    );

    gradient.selectAll("stop")
        .data(colorRange)
        .enter().append("stop")
        .attr("offset", (d, i) => `${i / (colorRange.length - 1) * 100}%`)
        .attr("stop-color", d => d);

    legendSvg.append("rect")
        .attr("width", legendWidth).attr("height", legendHeight - 10)
        .style("fill", "url(#legend-gradient)");

    const legendScale = d3.scaleLinear().domain(domain).range([0, legendWidth]);
    legendSvg.append("g")
        .attr("transform", `translate(0, ${legendHeight - 18})`)
        .call(d3.axisBottom(legendScale).ticks(5));
}

function createHistogram(data, attribute, container, label) {
    let svg = d3.select(container)
        .attr("width", 600).attr("height", 450)
        .append("g").attr("transform", "translate(50, 30)");

    let width = 500, height = 350;
    let x = d3.scaleLinear().domain([0, d3.max(data, d => d[attribute])]).range([0, width]);
    let bins = d3.histogram().domain(x.domain()).thresholds(x.ticks(20))(data.map(d => d[attribute]));
    let y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));
    svg.append("text").attr("x", width / 2).attr("y", -10).attr("text-anchor", "middle")
        .style("font-size", "16px").text(`Histogram of ${label.replace(/_/g, " ")}`);
    svg.append("text").attr("x", width / 2).attr("y", height + 35).attr("text-anchor", "middle")
        .text(label.replace(/_/g, " "));
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -35)
        .attr("text-anchor", "middle").text("Count");

    const tooltip = createTooltip();
    svg.selectAll("rect")
        .data(bins).enter().append("rect")
        .attr("x", d => x(d.x0))
        .attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 1))
        .attr("y", d => y(d.length))
        .attr("height", d => height - y(d.length))
        .attr("fill", "steelblue")
        .on("mouseover", (e, d) => tooltip.style("visibility", "visible").text(`Count: ${d.length}`))
        .on("mousemove", e => tooltip.style("top", `${e.pageY + 10}px`).style("left", `${e.pageX + 10}px`))
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("brush end", function (event) {
            if (activeBrush && activeBrush !== this) d3.select(activeBrush).call(d3.brush().clear);
            activeBrush = this;
            if (!event.selection) {
                currentFilter = null;
                updateMap(d3.select("#dropdown3").node().value);
                return;
            }
            const [x0, x1] = event.selection.map(x.invert);
            const selected = data.filter(d => d[attribute] >= x0 && d[attribute] <= x1);
            const ids = selected.map(d => d.id);
            currentFilter = ids;
            updateMapWithFilter(d3.select("#dropdown3").node().value, ids);
        });

    svg.append("g").attr("class", "brush").call(brush);
}

function createScatterplot(data, attrX, attrY) {
    let svg = d3.select("#scatterplot")
        .attr("width", 600).attr("height", 450)
        .append("g").attr("transform", "translate(50, 30)");

    let width = 500, height = 350;
    let x = d3.scaleLinear().domain(d3.extent(data, d => d.x)).range([0, width]);
    let y = d3.scaleLinear().domain(d3.extent(data, d => d.y)).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));
    svg.append("text").attr("x", width / 2).attr("y", -10).attr("text-anchor", "middle")
        .style("font-size", "16px").text(`${attrX.replace(/_/g, " ")} vs ${attrY.replace(/_/g, " ")}`);
    svg.append("text").attr("x", width / 2).attr("y", height + 35).attr("text-anchor", "middle")
        .text(attrX.replace(/_/g, " "));
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -35)
        .attr("text-anchor", "middle").text(attrY.replace(/_/g, " "));

    const tooltip = createTooltip();
    svg.selectAll("circle").data(data).enter().append("circle")
        .attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", 4).attr("fill", "steelblue").attr("opacity", 0.6)
        .on("mouseover", (e, d) => tooltip.style("visibility", "visible")
            .html(`<strong>${d.display_name}</strong><br>${attrX}: ${d.x}<br>${attrY}: ${d.y}`))
        .on("mousemove", e => tooltip.style("top", `${e.pageY + 10}px`).style("left", `${e.pageX + 10}px`))
        .on("mouseout", () => tooltip.style("visibility", "hidden"));

    const brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("brush end", function (event) {
            if (activeBrush && activeBrush !== this) d3.select(activeBrush).call(d3.brush().clear);
            activeBrush = this;
            if (!event.selection) {
                currentFilter = null;
                updateMap(d3.select("#dropdown3").node().value);
                return;
            }
            const [[x0, y0], [x1, y1]] = event.selection;
            const selected = data.filter(d => {
                const cx = x(d.x), cy = y(d.y);
                return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
            });
            const ids = selected.map(d => d.id);
            currentFilter = ids;
            updateMapWithFilter(d3.select("#dropdown3").node().value, ids);
        });

    svg.append("g").attr("class", "brush").call(brush);
}

function createTooltip() {
    return d3.select("body").append("div")
        .attr("class", "tooltip").style("position", "absolute")
        .style("background", "#dea3bf").style("color", "black")
        .style("padding", "5px").style("border-radius", "5px")
        .style("pointer-events", "none").style("visibility", "hidden");
}


function drawRadarChart(filteredData, attribute1, attribute2) {
    d3.select("#radarChart").selectAll("*").remove();

    const width = 600, height = 500, margin = 50;
    const radius = Math.min(width, height) / 2 - margin;

    const attributes = [
        "Poverty_Value", "MHI_value", "Food_Stamp_Value",
        "Obesity_Value", "Physical_Inactivity_Value", "Unemployment_Value"
    ];

    // Calculate average values for each attribute
    const averages = attributes.map(attr => {
        const values = filteredData.map(d => +d[attr]).filter(d => !isNaN(d));
        return {
            axis: attr.replace(/_/g, " "),
            value: values.length ? d3.mean(values) : 0
        };
    });

    const maxValue = d3.max(averages, d => d.value) || 1;
    const angleSlice = (2 * Math.PI) / averages.length;

    const svg = d3.select("#radarChart")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("style", "border: 2px solid black;")
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Draw concentric circles
    const levels = 5;
    for (let level = 1; level <= levels; level++) {
        svg.append("circle")
            .attr("r", (radius / levels) * level)
            .attr("fill", "none")
            .attr("stroke", "#ccc");
    }

    // Draw axes
    const axis = svg.selectAll(".axis")
        .data(averages)
        .enter()
        .append("g")
        .attr("class", "axis");

    axis.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", (d, i) => radius * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y2", (d, i) => radius * Math.sin(angleSlice * i - Math.PI / 2))
        .attr("stroke", "#999");

    axis.append("text")
        .attr("x", (d, i) => (radius + 20) * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("y", (d, i) => (radius + 20) * Math.sin(angleSlice * i - Math.PI / 2))
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(d => d.axis);

    // Radar line
    const radarLine = d3.lineRadial()
        .radius(d => (d.value / maxValue) * radius)
        .angle((d, i) => i * angleSlice)
        .curve(d3.curveLinearClosed);

    svg.append("path")
        .datum(averages)
        .attr("d", radarLine)
        .attr("fill", "lightblue")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("fill-opacity", 0.6);

    svg.selectAll(".radar-point")
        .data(averages)
        .enter()
        .append("circle")
        .attr("cx", (d, i) => (d.value / maxValue) * radius * Math.cos(angleSlice * i - Math.PI / 2))
        .attr("cy", (d, i) => (d.value / maxValue) * radius * Math.sin(angleSlice * i - Math.PI / 2))
        .attr("r", 4)
        .attr("fill", "steelblue");
        svg.append("text")
        .attr("x", 0)
        .attr("y", -radius - 30)  // Push it above the outermost circle
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text(filteredData.display_name || "Filtered Data");
    
}
