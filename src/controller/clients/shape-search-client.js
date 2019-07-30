import axios from 'axios';
import BaseClient from './base-client';
// require('lodash');


class ShapeSearchClient extends BaseClient {

  evaluateParams(feature, dataSource) {
    //console.log('shape-search-client evaluateParams is running');
    const params = {};
    if (!dataSource.options.params) { return params };
    const paramEntries = Object.entries(dataSource.options.params);
    const state = this.store.state;

    for (let [key, valOrGetter] of paramEntries) {
      let val;

      if (typeof valOrGetter === 'function') {
        // console.log(feature);
        val = valOrGetter(feature);
      } else {
        val = valOrGetter;
      }
      params[key] = val;
    }
    return params;
  }

  evaluateDataForUnits(data) {
    //console.log('shape-search-client evaluateDataForUnits data: ', data);
    // console.log("evaluateDataForUnits dataRows: ",dataRows);
    let groupedData = _.groupBy(data.rows, a => a.pwd_parcel_id);
    // console.log("evaluateDataForUnits groupedData: ", groupedData);

    var units = [], filteredData, dataList = [];

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      dataList.push(groupedData[item][0])
    }

    let bldgRecord = JSON.parse(JSON.stringify(data.rows[0]))

    if(units.length > 0) {
      units = _.groupBy(units, a => a.pwd_parcel_id);
      data.rows = data.rows.filter(a => !Object.keys(units).includes(a.pwd_parcel_id));
    }

    // console.log("Units List: ", units, "Data: ", data )
    this.store.commit('setUnits', units);

    for (let unit in units) {
      // console.log("Unit: ", units[unit])
      for (let i in bldgRecord) { bldgRecord[i] = ""  }
      let bldgRecordPush = JSON.parse(JSON.stringify(bldgRecord));
      bldgRecordPush.owner_1 = "Condominium (" + units[unit].length + " Units)";
      bldgRecordPush.owner_2 = null;
      bldgRecordPush.location = units[unit][0].location;
      bldgRecordPush.condo = true;
      bldgRecordPush.pwd_parcel_id = units[unit][0].pwd_parcel_id;
      data.rows.push(bldgRecordPush);
    }
    return data
  }

  fetch(input) {
    //console.log('shape-search-client fetch is running, input:', input);
    const data = input.map(a => a.properties.PARCELID)
    // console.log('shapeSearch DATA', data);

    const store = this.store;
    const shapeSearchConfig = this.config.shapeSearch;
    const url = shapeSearchConfig.url;

    let params = this.evaluateParams(data, shapeSearchConfig);
    // console.log('shape-search-client fetch params:', params);

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    return axios.get(url, { params })
                                    .then(success)
                                    .catch(error);
  }

  success(response) {
    // console.log('shapeSearch success response.data: ', response.data);

    const store = this.store;

    if (store.state.lastSearchMethod !== 'buffer search') {
      store.commit('setBufferShape', null);
    }

    let data = response.data;
    const url = response.config.url;

    // this.evaluateDataForCondos(data);
    data = this.evaluateDataForUnits(data);

    let features = data.rows
    features.map(a => typeof a.pwd_parcel_id === 'string' ? a.pwd_parcel_id = Number(a.pwd_parcel_id):"")
    // console.log(features)
    features = this.assignFeatureIds(features, 'shape');
    // console.log(features)


    // store.commit('setShapeSearchUnits', units);
    store.commit('setShapeSearchData', data);
    store.commit('setShapeSearchStatus', 'success');
    store.commit('setDrawShape', null);

    return features;
  }

  error(error) {
    // console.log("error respose: ", error);
    return
  }
}

export default ShapeSearchClient;
