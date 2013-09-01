var transit = (function () {
    return {
        initMap : function () {
            var mapDet = {
                mapTypeId: google.maps.MapTypeId.ROADMAP
            };

            var map = new google.maps.Map(document.getElementById('transitMap'), mapDet);
            return map;
        },

        initMarker : function (coords, mouseoverText, map) {
            mouseoverText = (typeof mouseoverText == 'undefined') ? 'Marker' : mouseoverText;
            var markerPos = new google.maps.LatLng(coords[0], coords[1]);

            var markerIcon = {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: 'red',
                fillOpacity: 0.8,
                scale: 5
            };

            var mouseoverInfo = new google.maps.InfoWindow({
                content: mouseoverText,
                map: map
            });

            var marker = {
                position: markerPos,
                title: mouseoverText,
                icon: markerIcon
            };

            marker = new google.maps.Marker(marker);

            google.maps.event.addListener(marker, 'mouseover', function() {
            	mouseoverInfo.open(map, this);
            });

            google.maps.event.addListener(marker, 'mouseout', function() {
            	mouseoverInfo.close();
            });

            return marker;
        },

        moveMarkers : function (markerSet, interval, map) {
            interval = (typeof interval == 'undefined') ? 1000 : interval;
            var transition = setInterval(
                    function () {
                        for (var counter = 0; counter < markerSet.length; counter++) {
                            for (var i = 0; i < markerSet.length; i++) {
                                var curPos = new google.maps.LatLng(markerSet[i].coordSet[counter][0],
                                    markerSet[i].coordSet[counter][1]);
                                markerSet[i].marker.position = curPos;
                                markerSet[i].marker.setMap(map);
                            }
                        }
                    },
                    interval);
        },

        constructMarkerSet : function (markers) {
            var markerSet = new Array();
            for (var counter = 0; counter < markers.length; counter++) {
                var markerObj = transit.initMarker(markers[counter].coords[0], markers[counter].title);
                var coordList = markers[counter].coords.slice(1);

                markerSet.push({
                    marker: markerObj,
                    coordSet: coordList
                });
            }
            return markerSet;
        },

        overlayKml : function (kmlUrl, map) {
            var kmlOptions = {
                map: map
            };
            var kmlLayer = new google.maps.KmlLayer(kmlUrl, kmlOptions);
        },

        init : function (kmlUrl, markerList, interval) {
            google.maps.event.addDomListener(window, 'load',
                    function () {
                        var map = transit.initMap();
                        transit.overlayKml(kmlUrl, map);
                        var markerSet = transit.constructMarkerSet(markerList);
                        transit.moveMarkers(markerSet, interval, map);
                    });
        },

        routeParser : function (xmlUrl) {
            $.ajax({
                url: xmlUrl,
                dataType: 'xml',
                success : function (data) {
                    var xmlNode = $('Document', data);
                    var lines = {};
                    var points = {};

                    xmlNode.find('Placemark > LineString > coordinates').each(function () {
                        var simPts = transit.trim($(this).text()).split(' ');
                        var grpPts = new Array();
                        var routeName = $(this).closest('Placemark').find('name').text().toLowerCase();
                        for (eachPt in simPts) {
                            var xy = transit.strip(simPts[eachPt]).split(',');
                            grpPts.push({ x: xy[0], y: xy[1] });
                        }
                        lines[routeName] = grpPts;
                    });

                    xmlNode.find('Point').each(function () {
                        var parentTag = $(this).closest('Placemark');

                        var xy = transit.strip(parentTag.find('Point').text()).split(',');
                        points[parentTag.find('name').text().toLowerCase()] = { x: xy[0], y: xy[1] };
                    });

                    return {
                        "lines": lines,
                        "points": points
                    };
                },
                error : function (data) {
                    console.log('Error');
                }
            });
        },

        vehicleParser : function (jsonUrl) {
            $.getJSON(jsonUrl).success(function (data) {
                return {
                    "timezone": data.timezone,
                    "vehicles": data.vehicles
                };
            });
        },

        schedule : function(vehicleObj, lines, timezone) {
            var vehicleArrivals = {};
            var vehicleDepartures = {};
            var vehicleTravelTimes = [];
            var stopsObj = vehicleObj.stops;
            var noOfStops = vehicleObj.stops.length;
            var startTime = transit.parseTime(stopsObj[0].departure, stopsObj[0].day, timezone);

            vehicleDepartures[stopsObj[0].name] = startTime;
            vehicleTravelTimes.push(startTime);

            for (var eachStop = 1; eachStop < noOfStops - 1; eachStop++) {
                var temp = stopsObj[eachStop];
                vehicleArrivals[temp.name] = transit.parseTime(temp.arrival,
                                                               temp.day, timezone) - startTime;
                vehicleDepartures[temp.name] = transit.parseTime(temp.departure,
                                                                 temp.day, timezone) - startTime;
                vehicleTravelTimes.push(transit.parseTime(temp.arrival, temp.day, timezone) - startTime,
                                        transit.parseTime(temp.departure, temp.day, timezone) - startTime);
            }

            var endTime = transit.parseTime(stopsObj[noOfStops].arrival,
                                            stopsObj[noOfStops].day, timezone) - startTime;
            vehicleArrivals[stopsObj[noOfStops].name] = endTime;
            vehicleTravelTimes.push(endTime);

            return {
                "name": vehicleObj.name,
                "info": vehicleObj.info,
                "route": lines[vehicleObj.route],
                "days": stopsObj[noOfStops].day - stopsObj[0].day,
                "arrivals": vehicleArrivals,
                "departures": vehicleDepartures,
                "traveltimes": vehicleTravelTimes
            };
        },

        strip : function (string) {
            return string.replace(/\s+/g, '').replace(/\n/g, '');
        },

        trim : function (string) {
            return string.replace(/^\s+|\s+$/g, '');
        },

        // Reimplemented from http://www.movable-type.co.uk/scripts/latlong.html
        haversine : function (sourceCoords, targetCoords) {
            var R = 6371; // km

            /** Converts numeric degrees to radians */
            if (typeof(Number.prototype.toRad) === "undefined") {
              Number.prototype.toRad = function() {
                return this * Math.PI / 180;
              }
            }

            var dLat = (targetCoords.x - sourceCoords.x).toRad();
            var dLon = (targetCoords.y - sourceCoords.y).toRad();
            var lat1 = sourceCoords.x.toRad();
            var lat2 = targetCoords.x.toRad();

            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            var d = R * c;
            return d;
        },

        linearDist : function (sourceCoords, targetCoords) {
            return Math.sqrt(Math.pow((targetCoords.x - sourceCoords.x), 2),
                             Math.pow((targetCoords.y - sourceCoords.y), 2));
        },

        percentDist : function (sourceCoords, targetCoords, percentage) {
            var newCoords = {};
            var ratio = percentage / 100;
            newCoords.x = (1 - ratio) * sourceCoords.x + ratio * targetCoords.x;
            newCoords.y = (1 - ratio) * sourceCoords.y + ratio * targetCoords.y;
            return newCoords;
        },

        percentInRange : function (lower, upper, target) {
            return ((target - lower) / (upper - lower)) * 100;
        },

        pointsBetweenStops: function (route, start, end) {
            return route.slice(route.indexOf(start), route.indexOf(end) + 1);
        },

        hashOfPercentDists : function (points) {
            var start = points[0];
            var routeLength = points.length;
            var end = points[routeLength - 1];
            var distanceHash = {
                0 : points[0]
            };
            var distances = new Array();
            var totalDist = 0;

            for (var x = 0; x < routeLength - 1; x++) {
                totalDist += transit.haversine(points[x], points[x + 1]);
                distances.push(totalDist);
            }

            for (var x = 0; x < distances.length; x++) {
                distanceHash[transit.percentInRange(0, totalDist, distances[x])] = points[x + 1];
            }

            return distanceHash;
        },

        // Variant of binary search that returns enclosing elements of searchElement in array.
        enclosure : function (searchElement) {
            'use strict';

            var minIndex = 0;
            var maxIndex = this.length - 1;
            var currentIndex;
            var currentElement;

            while (minIndex <= maxIndex) {
                currentIndex = (minIndex + maxIndex) / 2 | 0;
                currentElement = this[currentIndex];

                if (currentElement < searchElement) {
                    minIndex = currentIndex + 1;
                }
                else if (currentElement > searchElement) {
                    maxIndex = currentIndex - 1;
                }
                else {
                    return currentIndex;
                }
            }

            if (searchElement > this[currentIndex]) {
                if (typeof this[currentIndex + 1] != 'undefined')
                    return [currentIndex, currentIndex + 1];
                else
                    return currentIndex;
            } else {
                if (typeof this[currentIndex - 1] !=  'undefined')
                    return [currentIndex - 1, currentIndex];
                else
                    return 0;
            }
        },

        parseTime : function (timeString, day, timezone) {
            var hms = timeString.split(':');
            hms = hms.map(function (x) { return parseInt(x, 10); });

            if (hms.length < 3)
                hms[2] = 0;

            return hms[0] * 3600 + hms[1] * 60 + hms[2] + (day - 1) * 86400 + timezone * 60;
        }
    };
})();
