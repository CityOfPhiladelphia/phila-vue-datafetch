import axios from 'axios';
import BaseClient from './base-client';
// require('lodash');


class BufferSearchClient extends BaseClient {

  fetch(input) {
    const store = this.store;
    let geocodeConfig;

    geocodeConfig = this.config.geocoder;
    const url = geocodeConfig.url(input);
    const params = geocodeConfig.params;

    // update state
    this.store.commit('setBufferSearchStatus', 'waiting');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    console.log('bufferSearch success response.data: ', response.data);

    const store = this.store;
    let data = response.data;
    const url = response.config.url;

    // this.evaluateDataForCondos(data);
    data = this.evaluateDataForUnits(data);

    let features = data.rows;
    features.map(a => typeof a.pwd_parcel_id === 'string' ? a.pwd_parcel_id = Number(a.pwd_parcel_id):"");
    // console.log(features)
    features = this.assignFeatureIds(features, 'buffer');
    // console.log(features)


    store.commit('setBufferSearchData', data);
    store.commit('setBufferSearchStatus', 'success');
    store.commit('setBufferMode', false);

    return features;
  }

  error(error) {
    // console.log("error respose: ", error);
    return;
  }

  evaluateDataForUnits(data) {
    //console.log('shape-search-client evaluateDataForUnits data: ', data);
    // console.log("evaluateDataForUnits dataRows: ",dataRows);
    let groupedData = _.groupBy(data.rows, a => a.pwd_parcel_id);
    // console.log("evaluateDataForUnits groupedData: ", groupedData);

    var units = [], filteredData, dataList = [];

    for (let item in groupedData){
      groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) : dataList.push(groupedData[item][0]);
    }

    let bldgRecord = JSON.parse(JSON.stringify(data.rows[0]));

    if(units.length > 0) {
      units = _.groupBy(units, a => a.pwd_parcel_id);
      data.rows = data.rows.filter(a => !Object.keys(units).includes(a.pwd_parcel_id));
    }

    // console.log("Units List: ", units, "Data: ", data )
    this.store.commit('setUnits', units);

    for (let unit in units) {
      // console.log("Unit: ", units[unit])
      for (let i in bldgRecord) {
        bldgRecord[i] = "";
      }
      let bldgRecordPush = JSON.parse(JSON.stringify(bldgRecord));
      bldgRecordPush.owner_1 = "Condominium (" + units[unit].length + " Units)";
      bldgRecordPush.owner_2 = null;
      bldgRecordPush.location = units[unit][0].location;
      bldgRecordPush.condo = true;
      bldgRecordPush.pwd_parcel_id = units[unit][0].pwd_parcel_id;
      data.rows.push(bldgRecordPush);
    }
    return data;
  }
}

export default BufferSearchClient;
