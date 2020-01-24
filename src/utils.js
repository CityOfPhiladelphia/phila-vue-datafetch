import { point, polygon, multiPolygon } from '@turf/helpers';
import distance from '@turf/distance';
import area from '@turf/area';

export default {

  projection4326: "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs",
  projection2272: "+proj=lcc +lat_1=40.96666666666667 +lat_2=39.93333333333333 +lat_0=39.33333333333334 +lon_0=-77.75 +x_0=600000 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs",

  sortDorParcelFeatures(features) {
    // map parcel status to a numeric priority
    // (basically so remainders come before inactives)
    const STATUS_PRIORITY = {
      1: 1,
      2: 3,
      3: 2,
    };

    // first sort by mapreg (descending)
    features.sort((a, b) => {
      const mapregA = a.properties.MAPREG;
      const mapregB = b.properties.MAPREG;

      if (mapregA < mapregB) {
        return 1;
      }
      if (mapregA > mapregB) {
        return -1;
      }
      return 0;
    });

    // then sort by status
    features.sort((a, b) => {
      const statusA = STATUS_PRIORITY[a.properties.STATUS];
      const statusB = STATUS_PRIORITY[b.properties.STATUS];

      if (statusA < statusB) {
        return -1;
      }
      if (statusA > statusB) {
        return 1;
      }
      return 0;
    });

    return features;
  },

  getDistances(coords) {
    // console.log('getDistances, coords:', coords)
    let turfCoordinates = [];
    for (let coordinate of coords[0]) {
      // console.log('in getDistances, coordinate:', coordinate);
      turfCoordinates.push(point(coordinate));
    }
    let distances = [];
    for (let i=0; i<turfCoordinates.length - 1; i++) {
      distances[i] = distance(turfCoordinates[i], turfCoordinates[i+1], { units: 'feet' });
    }
    return distances;
  },

  getMultiPolyDistances(coords) {
    // console.log('getMultiPolyDistances, coords:', coords)
    let turfCoordinates = [];
    for (let coordinate of coords) {
      // console.log('in getMultiPolyDistances, coordinate:', coordinate);
      turfCoordinates.push(point(coordinate));
    }
    let distances = [];
    for (let i=0; i<turfCoordinates.length - 1; i++) {
      distances[i] = distance(turfCoordinates[i], turfCoordinates[i+1], { units: 'feet' });
    }
    return distances;
  },

  calculateAreaAndPerimeter(feature) {
    let coords = feature.geometry.coordinates;

    // console.log('utils.calculateAreaAndPerimeter, feature:', feature, 'coords.length:', coords.length);
    if (coords.length > 1 || feature.geometry.type === 'MultiPolygon') {
      let distances = [];
      let areas = [];
      for (let coordsSet of coords) {
        // console.log('coordsSet:', coordsSet);
        if (coordsSet.length > 2) {
          // console.log('in multiPolygon loop');
          const turfPolygon = multiPolygon(coordsSet);
          distances.push(this.getMultiPolyDistances(coordsSet).reduce(function(acc, val) {
            return acc + val;
          }));
          areas.push(area(turfPolygon) * 10.7639);
          // console.log('areas:', areas);
        } else {
          // console.log('in polygon loop');
          const turfPolygon = polygon(coordsSet);
          distances.push(this.getDistances(coordsSet).reduce(function(acc, val) {
            return acc + val;
          }));
          areas.push(area(turfPolygon) * 10.7639);
        }
      }
      return { perimeter: distances.reduce(function(acc, val) {
        return acc + val;
      }),
      area: areas.reduce(function(acc, val) {
        return acc + val;
      }),
      };
      // feature.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
      // feature.properties.TURF_AREA = areas.reduce(function(acc, val) { return acc + val; });
    }
    // console.log('coords:', coords);
    const turfPolygon = polygon(coords);
    let distances = this.getDistances(coords);
    return { perimeter: distances.reduce(function(acc, val) {
      return acc + val;
    }),
    area: area(turfPolygon) * 10.7639,
    };
    // feature.properties.TURF_PERIMETER = distances.reduce(function(acc, val) { return acc + val; });
    // feature.properties.TURF_AREA = area(turfPolygon) * 10.7639;

  },

  // evaluateDataForUnits(data) {
  //   //console.log('shape-search-client evaluateDataForUnits data: ', data);
  //   // console.log("evaluateDataForUnits dataRows: ",dataRows);
  //   let groupedData = _.groupBy(data.rows, a => a.pwd_parcel_id);
  //   // console.log("evaluateDataForUnits groupedData: ", groupedData);
  //
  //   var units = [], filteredData, dataList = [];
  //
  //   for (let item in groupedData){
  //     groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) : dataList.push(groupedData[item][0]);
  //   }
  //
  //   let bldgRecord = JSON.parse(JSON.stringify(data.rows[0]));
  //
  //   if(units.length > 0) {
  //     units = _.groupBy(units, a => a.pwd_parcel_id);
  //     data.rows = data.rows.filter(a => !Object.keys(units).includes(a.pwd_parcel_id));
  //   }
  //
  //   // console.log("Units List: ", units, "Data: ", data )
  //   this.store.commit('setUnits', units);
  //
  //   for (let unit in units) {
  //     // console.log("Unit: ", units[unit])
  //     for (let i in bldgRecord) {
  //       bldgRecord[i] = "";
  //     }
  //     let bldgRecordPush = JSON.parse(JSON.stringify(bldgRecord));
  //     bldgRecordPush.owner_1 = "Condominium (" + units[unit].length + " Units)";
  //     bldgRecordPush.owner_2 = null;
  //     bldgRecordPush.location = units[unit][0].location;
  //     bldgRecordPush.condo = true;
  //     bldgRecordPush.pwd_parcel_id = units[unit][0].pwd_parcel_id;
  //     data.rows.push(bldgRecordPush);
  //   }
  //   return data;
  // },
};
