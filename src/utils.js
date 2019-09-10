import { point, polygon } from '@turf/helpers';
import distance from '@turf/distance';
import area from '@turf/area';

export default {

  sortDorParcelFeatures(features) {
    // map parcel status to a numeric priority
    // (basically so remainders come before inactives)
    const STATUS_PRIORITY = {
      1: 1,
      2: 3,
      3: 2
    }

    // first sort by mapreg (descending)
    features.sort((a, b) => {
      const mapregA = a.properties.MAPREG;
      const mapregB = b.properties.MAPREG;

      if (mapregA < mapregB) return 1;
      if (mapregA > mapregB) return -1;
      return 0;
    });

    // then sort by status
    features.sort((a, b) => {
      const statusA = STATUS_PRIORITY[a.properties.STATUS];
      const statusB = STATUS_PRIORITY[b.properties.STATUS];

      if (statusA < statusB) return -1;
      if (statusA > statusB) return 1;
      return 0;
    });

    return features;
  },

  getDistances(coords) {
    let turfCoordinates = []
    for (let coordinate of coords[0]) {
      turfCoordinates.push(point(coordinate));
    }
    let distances = [];
    for (let i=0; i<turfCoordinates.length - 1; i++) {
      distances[i] = distance(turfCoordinates[i], turfCoordinates[i+1], {units: 'feet'});
    }
    return distances;
  },

  calculateAreaAndPerimeter(feature) {
    let coords = feature.geometry.coordinates;

    // console.log('feature:', feature, 'coords.length:', coords.length);
    if (coords.length > 1) {
      let distances = [];
      let areas = [];
      for (let coordsSet of coords) {
        // console.log('coordsSet:', coordsSet);
        const turfPolygon = polygon(coordsSet);
        distances.push(this.getDistances(coordsSet).reduce(function(acc, val) { return acc + val; }));
        areas.push(area(turfPolygon) * 10.7639);
      }
      return { perimeter: distances.reduce(function(acc, val) { return acc + val; }),
               area: areas.reduce(function(acc, val) { return acc + val; })
             }
      // feature.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
      // feature.properties.TURF_AREA = areas.reduce(function(acc, val) { return acc + val; });
    } else {
      // console.log('coords:', coords);
      const turfPolygon = polygon(coords);
      let distances = this.getDistances(coords);
      return { perimeter: distances.reduce(function(acc, val) { return acc + val; }),
               area: area(turfPolygon) * 10.7639
             }
      // feature.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
      // feature.properties.TURF_AREA = area(turfPolygon) * 10.7639;
    }
  }
}
